import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FilaPersona } from '@bc/core';
import { BitacoraService, type ContextoAuditoria } from '../bitacora/bitacora.service.js';
import { CadenaService } from '../cadena/cadena.service.js';
import { verificarFirmaNode } from '../cripto/verificador-firma.node.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CrearPersonaDto } from '../personas/dto/crear-persona.dto.js';
import type { ConfirmarBloqueDto } from './dto/confirmar-bloque.dto.js';

const VIDA_DEL_BORRADOR_MS = 5 * 60_000;

@Injectable()
export class BloquesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadena: CadenaService,
    private readonly bitacora: BitacoraService,
  ) {}

  /** Paso 1: valida, cifra y guarda un borrador; devuelve el `hash_datos` que el usuario debe firmar. */
  async preparar(
    usuarioId: number,
    username: string,
    datos: CrearPersonaDto,
    ctx: ContextoAuditoria,
  ) {
    // limpieza de borradores vencidos
    await this.prisma.borrador.deleteMany({ where: { expira_en: { lt: new Date() } } });
    if (await this.prisma.persona.findUnique({ where: { cedula: datos.cedula } })) {
      throw new ConflictException('Registro duplicado');
    }
    const { fila, hash_datos } = this.cadena.construirFila(datos, username);
    const borrador = await this.prisma.borrador.create({
      data: {
        usuario_id: usuarioId,
        fila_json: JSON.stringify(fila),
        hash_datos,
        expira_en: new Date(Date.now() + VIDA_DEL_BORRADOR_MS),
      },
    });
    await this.bitacora.registrar({
      ...ctx,
      accion: 'preparar_bloque',
      resultado: 'ok',
      detalle: `borrador ${borrador.id.slice(0, 8)}`,
    });
    return { borrador_id: borrador.id, hash_datos };
  }

  /**
   * Paso 3: verifica la firma del usuario y recién entonces mina y anexa el bloque.
   * Todo va por la cola de anexos: un mismo borrador no se puede confirmar dos veces.
   */
  confirmar(usuarioId: number, dto: ConfirmarBloqueDto, ctx: ContextoAuditoria) {
    return this.cadena.serializar(async () => {
      try {
        const bloque = await this.confirmarEnCola(usuarioId, dto);
        // fuera de la transacción: la bitácora usa la misma conexión de SQLite
        await this.bitacora.registrar({
          ...ctx,
          accion: 'crear_bloque',
          resultado: 'ok',
          detalle: `bloque ${bloque.indice}`,
        });
        return bloque;
      } catch (error) {
        await this.bitacora.registrar({
          ...ctx,
          accion: 'crear_bloque',
          resultado: 'fallo',
          detalle: error instanceof HttpException ? error.message : 'error interno',
        });
        throw error;
      }
    });
  }

  /** Cuerpo de `confirmar`; ya corre dentro de la cola de anexos. */
  private async confirmarEnCola(usuarioId: number, dto: ConfirmarBloqueDto) {
    {
      const borrador = await this.prisma.borrador.findUnique({ where: { id: dto.borrador_id } });
      // el borrador de otro usuario se trata como inexistente
      if (!borrador || borrador.usuario_id !== usuarioId) {
        throw new NotFoundException('Recurso no encontrado');
      }
      if (borrador.expira_en <= new Date()) {
        await this.prisma.borrador.delete({ where: { id: borrador.id } });
        throw new GoneException('El borrador expiró');
      }
      const llave = await this.prisma.llaveUsuario.findUnique({ where: { id: dto.llave_id } });
      if (!llave || llave.usuario_id !== usuarioId || llave.estado !== 'aprobada') {
        throw new ForbiddenException('Llave no autorizada');
      }
      if (!(await verificarFirmaNode(llave.spki_b64, borrador.hash_datos, dto.firma_b64))) {
        throw new BadRequestException('Firma inválida');
      }
      // un anexo nuevo no puede "lavar" una cadena alterada: se verifica todo antes de escribir
      await this.cadena.exigirCadenaIntegra();
      const fila = JSON.parse(borrador.fila_json) as FilaPersona;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const bloque = await this.cadena.anexarBloqueTx(
            tx,
            fila,
            borrador.hash_datos,
            dto.firma_b64,
            llave.id,
          );
          await tx.borrador.delete({ where: { id: borrador.id } });
          return bloque;
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException('Registro duplicado');
        }
        throw error;
      }
    }
  }
}
