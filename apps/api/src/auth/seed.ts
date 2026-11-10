import { hash, argon2id } from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';

export async function seedAdmin(prisma: PrismaService): Promise<void> {
  const username = process.env['ADMIN_USERNAME'];
  const password = process.env['ADMIN_PASSWORD'];
  if (!username?.trim()) throw new Error('ADMIN_USERNAME es obligatorio');
  if (!password || password.length < 12)
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres');
  const password_hash = await hash(password, { type: argon2id });
  await prisma.usuario.upsert({
    where: { username },
    update: {},
    create: { username, password_hash, rol: 'admin' },
  });
}
