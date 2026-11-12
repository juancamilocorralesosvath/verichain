import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { argon2id, hash } from 'argon2';
import { BitacoraService, type ContextoAuditoria } from '../bitacora/bitacora.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import type { CrearUsuarioDto } from './dto/crear-usuario.dto.js';

/** Nunca se selecciona password_hash: las respuestas no pueden filtrarlo. */
const PUBLICO = { id: true, username: true, rol: true, activo: true, creado_en: true } as const;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
  ) {}

  listar() {
    return this.prisma.usuario.findMany({ select: PUBLICO, orderBy: { id: 'asc' } });
  }

  async crear(dto: CrearUsuarioDto, ctx: ContextoAuditoria) {
    if (await this.prisma.usuario.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException('Registro duplicado');
    }
    const password_hash = await hash(dto.password, { type: argon2id });
    try {
      const usuario = await this.prisma.usuario.create({
        data: { username: dto.username, password_hash, rol: dto.rol },
        select: PUBLICO,
      });
      await this.bitacora.registrar({
        ...ctx,
        accion: 'usuario_crear',
        resultado: 'ok',
        detalle: `usuario ${usuario.username} (${usuario.rol})`,
      });
      return usuario;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Registro duplicado');
      }
      throw error;
    }
  }

  /** No se borran usuarios (quedan referenciados en bloques y bitácora): solo se desactivan o cambian de rol. */
  async actualizar(id: number, dto: ActualizarUsuarioDto, actorId: number, ctx: ContextoAuditoria) {
    if (dto.activo === undefined && dto.rol === undefined) {
      throw new BadRequestException('Indica al menos un campo: activo o rol');
    }
    const existente = await this.prisma.usuario.findUnique({ where: { id }, select: PUBLICO });
    if (!existente) throw new NotFoundException('Recurso no encontrado');
    // un admin no puede desactivarse ni quitarse el rol de admin: siempre queda al menos uno
    if (
      id === actorId &&
      (dto.activo === false || (dto.rol !== undefined && dto.rol !== 'admin'))
    ) {
      throw new ForbiddenException('No puedes desactivarte ni quitarte el rol de admin');
    }
    const actualizado = await this.prisma.usuario.update({
      where: { id },
      data: {
        ...(dto.activo !== undefined && { activo: dto.activo }),
        ...(dto.rol !== undefined && { rol: dto.rol }),
      },
      select: PUBLICO,
    });
    // la sesión abierta de este usuario se rechaza en su siguiente petición: AuthService.autenticar
    // consulta `activo` y compara el rol del token con el de la BD
    const cambios = [
      dto.activo !== undefined && `activo=${dto.activo}`,
      dto.rol !== undefined && `rol=${dto.rol}`,
    ].filter(Boolean);
    await this.bitacora.registrar({
      ...ctx,
      accion: 'usuario_editar',
      resultado: 'ok',
      detalle: `usuario ${actualizado.username}: ${cambios.join(', ')}`,
    });
    return actualizado;
  }
}
