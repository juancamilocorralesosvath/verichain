import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CadenaService } from './cadena.service.js';
import { Publico, Roles } from '../auth/permisos.js';

@Controller('cadena')
export class CadenaController {
  constructor(private readonly cadena: CadenaService) {}

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
  async exportar(@Res({ passthrough: true }) res: Response) {
    const exportacion = await this.cadena.exportar();
    // cadena-AAAAMMDD-HHmm.json (UTC)
    const marca = exportacion.exportado_en
      .replace(/[-:]/g, '')
      .replace(/^(\d{8})T(\d{4}).*$/, '$1-$2');
    res.setHeader('Content-Disposition', `attachment; filename="cadena-${marca}.json"`);
    return exportacion;
  }

  @Get('verificar')
  @Roles('admin', 'auditor')
  verificar() {
    return this.cadena.verificar();
  }
}
