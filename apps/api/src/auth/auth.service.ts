import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { argon2id, hash, verify } from 'argon2';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface Identidad {
  sub: number;
  username: string;
  rol: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private ficticio = '';
  private readonly secret: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly bitacora: BitacoraService,
  ) {
    const secret = process.env['JWT_SECRET'];
    if (!secret?.trim()) throw new Error('JWT_SECRET es obligatorio');
    this.secret = secret;
  }
  async onModuleInit(): Promise<void> {
    this.ficticio = await hash('contraseña ficticia', { type: argon2id });
  }
  async login(
    username: string,
    password: string,
    ip: string,
  ): Promise<{ token: string; usuario: { username: string; rol: string } }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { username } });
    const valido = await verify(usuario?.password_hash ?? this.ficticio, password);
    if (!usuario || !valido || !usuario.activo) {
      // no se guarda lo escrito en el campo usuario: a menudo es una contraseña
      await this.bitacora.registrar({
        usuario: '-',
        accion: 'login_fallido',
        resultado: 'fallo',
        ip,
        detalle: 'credenciales inválidas',
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.bitacora.registrar({
      usuario: usuario.username,
      accion: 'login',
      resultado: 'ok',
      ip,
      detalle: 'inicio de sesión',
    });
    const identidad: Identidad = { sub: usuario.id, username: usuario.username, rol: usuario.rol };
    const expiresIn = (process.env['JWT_EXPIRES_IN'] ?? '15m') as JwtSignOptions['expiresIn'];
    const token = await this.jwt.signAsync(identidad, {
      secret: this.secret,
      algorithm: 'HS256',
      expiresIn,
    });
    return { token, usuario: { username: usuario.username, rol: usuario.rol } };
  }
  async autenticar(token: string): Promise<Identidad> {
    try {
      const payload = await this.jwt.verifyAsync<Identidad>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      if (!Number.isInteger(payload.sub)) throw new Error('Token inválido');
      const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
      if (!usuario?.activo || usuario.username !== payload.username || usuario.rol !== payload.rol)
        throw new Error('Usuario inválido');
      return { sub: usuario.id, username: usuario.username, rol: usuario.rol };
    } catch {
      throw new UnauthorizedException('Sesión inválida');
    }
  }
}
