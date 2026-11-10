# @bc/api

Servicio NestJS (integridad, auth, cifrado, firmas). ESM de punta a punta, Prisma 7 + SQLite.

## Comandos

```bash
npm run dev -w @bc/api            # compila @bc/core, genera Prisma y levanta con recarga
npm run build -w @bc/api
npm run test -w @bc/api
npm run prisma:migrate -w @bc/api # crea/aplica migraciones (BD en apps/api/data/, ignorada por git)
npm run seed -w @bc/api           # crea el admin inicial si aún no existe
```

Copia `.env.example` a `.env` en la raíz. Configura `JWT_SECRET`, `JWT_EXPIRES_IN`,
`ADMIN_USERNAME` y `ADMIN_PASSWORD` (mínimo 12 caracteres) antes de iniciar la API y ejecutar el seed.
El seed es idempotente y no cambia la contraseña de un usuario ya existente.

## Seguridad por defecto

`ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`), `helmet`, CORS solo para `WEB_ORIGIN`,
throttler de 100 solicitudes/min por IP y un filtro de excepciones que no expone trazas al cliente.
Todo se activa en `src/configurar-app.ts`, que comparten `main.ts` y las pruebas e2e.

`GET /api/salud` → `{ ok: true, coreVersion }`.
