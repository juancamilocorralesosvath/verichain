import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarApp } from './configurar-app.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarApp(app, process.env['WEB_ORIGIN'] ?? 'http://localhost:5173', {
    confiarEnProxy: process.env['TRUST_PROXY'] === '1',
  });
  await app.listen(Number(process.env['PORT'] ?? 3000));
}

void arrancar();
