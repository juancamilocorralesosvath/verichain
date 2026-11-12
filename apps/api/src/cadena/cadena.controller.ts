import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CadenaService } from './cadena.service.js';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Publico, Roles } from '../auth/permisos.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { contextoDe } from '../bitacora/contexto.js';

@Controller('cadena')
export class CadenaController {
  constructor(
    private readonly cadena: CadenaService,
    private readonly bitacora: BitacoraService,
  ) {}

  @Get()
  listar() {
    return this.cadena.listarCadena();
  }

  // Público: solo expone la clave pública del servidor y su huella.
  @Get('llave-servidor')
  @Publico()
  llaveServidor() {
    return this.cadena.llaveServidor();
  }

  @Get('exportar')
  @Roles('admin', 'auditor')
  async exportar(@Res({ passthrough: true }) res: Response, @Req() req: SolicitudAutenticada) {
    const exportacion = await this.cadena.exportar();
    await this.bitacora.registrar({
      ...contextoDe(req),
      accion: 'exportar',
      resultado: 'ok',
      detalle: `bloques ${exportacion.bloques.length}`,
    });
    // cadena-AAAAMMDD-HHmm.json (UTC)
    const marca = exportacion.exportado_en
      .replace(/[-:]/g, '')
      .replace(/^(\d{8})T(\d{4}).*$/, '$1-$2');
    res.setHeader('Content-Disposition', `attachment; filename="cadena-${marca}.json"`);
    return exportacion;
  }

  @Get('verificar')
  @Roles('admin', 'auditor')
  async verificar(@Req() req: SolicitudAutenticada) {
    const reporte = await this.cadena.verificar();
    await this.bitacora.registrar({
      ...contextoDe(req),
      accion: 'verificar',
      resultado: 'ok',
      detalle: `${reporte.valida ? 'íntegra' : 'comprometida'}, ${reporte.totalBloques} bloques`,
    });
    return reporte;
  }
}
