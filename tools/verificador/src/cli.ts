#!/usr/bin/env node
import process from 'node:process';
import { ejecutar } from './ejecutar.js';

process.exitCode = await ejecutar(process.argv.slice(2), {
  out: (texto) => process.stdout.write(texto),
  err: (texto) => process.stderr.write(texto),
});
