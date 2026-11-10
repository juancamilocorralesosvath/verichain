import { PrismaService } from '../prisma/prisma.service.js';
import { seedAdmin } from './seed.js';

const prisma = new PrismaService();
try {
  await seedAdmin(prisma);
  console.log('Admin inicial configurado');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Error al crear el admin');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
