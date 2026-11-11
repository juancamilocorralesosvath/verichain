import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard, type SolicitudAutenticada } from './jwt-auth.guard.js';
import { LoginDto } from './login.dto.js';

const opcionesCookie = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env['NODE_ENV'] === 'production',
  path: '/api',
});
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ username: string; rol: string }> {
    const { token, usuario } = await this.auth.login(dto.username, dto.password);
    res.cookie('sesion', token, opcionesCookie());
    return usuario;
  }
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie('sesion', opcionesCookie());
  }
  @Get('yo')
  @UseGuards(JwtAuthGuard)
  yo(@Req() req: SolicitudAutenticada): { username: string; rol: string } {
    return { username: req.identidad.username, rol: req.identidad.rol };
  }
}
