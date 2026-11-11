import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Cola } from '../comun/cola.js';
import type { LlaveUsuario } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { validarLlaveP256 } from './validar-llave.js';

/** Mapeo explícito: no se exponen campos internos (usuario_id, aprobada_por...). */
const aRespuesta = (l: LlaveUsuario) => ({
  id: l.id,
  version: l.version,
  estado: l.estado,
  spki_b64: l.spki_b64,
  creado_en: l.creado_en,
  aprobada_en: l.aprobada_en,
});

@Injectable()
export class LlavesService {
  /** Serializa registros y aprobaciones (un solo servidor). */
  private readonly cola = new Cola();

  constructor(private readonly prisma: PrismaService) {}

  /** Registra una llave pública: queda `pendiente`, con la versión siguiente del usuario. */
  registrar(usuarioId: number, spkiB64: string) {
    validarLlaveP256(spkiB64);
    return this.cola.ejecutar(async () => {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (await tx.llaveUsuario.findUnique({ where: { spki_b64: spkiB64 } })) {
            throw new ConflictException('Registro duplicado');
          }
          const ultima = await tx.llaveUsuario.findFirst({
            where: { usuario_id: usuarioId },
            orderBy: { version: 'desc' },
          });
          const llave = await tx.llaveUsuario.create({
            data: {
              usuario_id: usuarioId,
              version: (ultima?.version ?? 0) + 1,
              spki_b64: spkiB64,
              estado: 'pendiente',
            },
          });
          // TODO(H7.2): registrar el evento en la bitácora
          return aRespuesta(llave);
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException('Registro duplicado');
        }
        throw error;
      }
    });
  }

  async mias(usuarioId: number) {
    const llaves = await this.prisma.llaveUsuario.findMany({
      where: { usuario_id: usuarioId },
      orderBy: { version: 'asc' },
    });
    return llaves.map(aRespuesta);
  }

  async pendientes() {
    const llaves = await this.prisma.llaveUsuario.findMany({
      where: { estado: 'pendiente' },
      orderBy: { id: 'asc' },
      include: { usuario: { select: { username: true } } },
    });
    return llaves.map((l) => ({ ...aRespuesta(l), username: l.usuario.username }));
  }

  /** Aprueba una llave pendiente; la aprobada anterior del mismo usuario pasa a `reemplazada`. */
  aprobar(adminId: number, id: number) {
    return this.cola.ejecutar(() =>
      this.prisma.$transaction(async (tx) => {
        const llave = await this.pendienteOFallar(tx, id);
        // primero se retira la vigente: el índice parcial permite una sola `aprobada` por usuario
        await tx.llaveUsuario.updateMany({
          where: { usuario_id: llave.usuario_id, estado: 'aprobada' },
          data: { estado: 'reemplazada' },
        });
        const aprobada = await tx.llaveUsuario.update({
          where: { id },
          data: { estado: 'aprobada', aprobada_por: adminId, aprobada_en: new Date() },
        });
        // TODO(H7.2): registrar la aprobación en la bitácora
        return aRespuesta(aprobada);
      }),
    );
  }

  rechazar(id: number) {
    return this.cola.ejecutar(() =>
      this.prisma.$transaction(async (tx) => {
        await this.pendienteOFallar(tx, id);
        const rechazada = await tx.llaveUsuario.update({
          where: { id },
          data: { estado: 'rechazada' },
        });
        // TODO(H7.2): registrar el rechazo en la bitácora
        return aRespuesta(rechazada);
      }),
    );
  }

  /** llave_id → spki_b64 de las llaves con las que pudo firmarse un bloque (aprobadas y reemplazadas). */
  async llavesParaVerificacion(): Promise<Record<number, string>> {
    const llaves = await this.prisma.llaveUsuario.findMany({
      where: { estado: { in: ['aprobada', 'reemplazada'] } },
    });
    return Object.fromEntries(llaves.map((l) => [l.id, l.spki_b64]));
  }

  private async pendienteOFallar(
    tx: Pick<PrismaService, 'llaveUsuario'>,
    id: number,
  ): Promise<LlaveUsuario> {
    const llave = await tx.llaveUsuario.findUnique({ where: { id } });
    if (!llave) throw new NotFoundException('Recurso no encontrado');
    if (llave.estado !== 'pendiente') throw new ConflictException('La llave no está pendiente');
    return llave;
  }
}
