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

## Modo demo: ataques, snapshot y restaurar (H6)

Con `DEMO_MODE=true` (nunca en producción) el admin tiene estas rutas; sin esa variable no existen (404):

- `GET /api/ataques` y `POST /api/ataques/:id { indice? }`: `modificar-dato`, `modificar-cifrado`,
  `reescribir-cadena`, `truncar` y `reordenar`. Escriben directo en la BD, como un atacante con acceso a la base.
- `POST /api/demo/snapshot`: guarda una copia consistente de la BD en `snapshot.db` (junto a la BD) con la API de
  backup de SQLite. `POST /api/demo/restaurar`: vuelve a ese estado y devuelve el resultado de verificar
  (sin snapshot responde 409). Restaurar es el _rollback_ que el diseño acepta como riesgo (§7b): vuelve a una
  cadena y unos sellos antiguos que son coherentes entre sí.

Los usuarios y sus sesiones también vuelven al estado del snapshot: haz el snapshot cuando ya existan todos los
usuarios de la demo.

### Ataque manual con sqlite3

1. Instala el cliente: `sudo apt install sqlite3`.
2. Con la API en modo demo y una cadena con al menos una persona, abre la BD (por defecto `apps/api/data/blockchain.db`):

   ```bash
   sqlite3 apps/api/data/blockchain.db
   ```

3. Altera un dato directamente en la tabla:

   ```sql
   UPDATE Persona SET nombre='Mallory' WHERE id=1;
   ```

4. Vuelve a la aplicación y verifica (página Verificar o `GET /api/cadena/verificar` como admin o auditor): el
   bloque de esa persona sale en rojo con `hashDatos` y `hashCadena` en `falla`.
5. Restaura la demo con `POST /api/demo/restaurar` (si guardaste un snapshot antes).
