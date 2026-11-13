# Verichain

Proyecto final de Ciberseguridad (Icesi): una **blockchain simulada con integridad verificable**. Parte de una tabla
de personas (cédula, nombre, dirección, teléfono); cada registro es un bloque con su `SHA-256`, enlazado al anterior,
con prueba de trabajo, firma del usuario y sello del servidor. Se puede **atacar la base de datos en vivo** y el sistema
señala qué se rompió y por qué, y la cadena exportada se verifica **sin confiar en el servidor**.

- Diseño (fuente de verdad): [`docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md`](docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md)
- Backlog y estado: [`docs/backlog/README.md`](docs/backlog/README.md) · Reglas de trabajo: [`AGENTS.md`](AGENTS.md)

## Requisitos

- Node.js **≥ 22.12** (probado con 24) y npm.
- `openssl` (solo para la CA propia / HTTPS) y, para la demo con Docker, Docker con Compose v2.
- Opcional: `sqlite3` para el ataque manual.

## Instalación en desarrollo

Desde la raíz del repositorio:

```bash
npm install
cp .env.example .env     # ignorado por git: nunca lo subas
```

Edita `.env` y completa:

| Variable         | Cómo obtenerla                                                                |
| ---------------- | ----------------------------------------------------------------------------- |
| `JWT_SECRET`     | `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `DATA_KEY`       | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ADMIN_PASSWORD` | la que quieras, **mínimo 12 caracteres**                                      |
| `DEMO_MODE`      | `true` para ver los ataques y "Restaurar demo" (nunca en producción)          |

Después:

```bash
npm run llaves:servidor -w @bc/api   # llave de firma del servidor (apps/api/secrets/); sin ella la API NO arranca
npm run build -w @bc/core            # las apps consumen @bc/core ya compilado
cd apps/api && npx prisma migrate deploy && cd ../..   # crea apps/api/data/blockchain.db
npm run seed -w @bc/api              # crea el admin (ADMIN_USERNAME / ADMIN_PASSWORD)
npm run dev -w @bc/api               # API en http://localhost:3000
npm run dev -w @bc/web               # web en http://127.0.0.1:5173 (en otra terminal)
```

Otros comandos útiles: `npm run check` (formato + lint + tipos + pruebas), `npm run test`, `npm run build`.
Si cambias la estructura de la BD o vienes de una versión anterior, borra `apps/api/data/` y repite la migración y el seed.

## Instalación con Docker (HTTPS con CA propia)

```bash
bash infra/tls/generar-ca.sh                 # crea la CA y el certificado de localhost en secrets/tls/
cp .env.example .env                         # y completa JWT_SECRET, DATA_KEY y ADMIN_PASSWORD (ver arriba)
npm run llaves:servidor -w @bc/api           # llave de firma del servidor (se monta solo lectura en el contenedor)
docker compose up --build -d                 # nginx (443 y 80→443) + API
docker compose exec api node dist/auth/ejecutar-seed.js   # crea el admin (una sola vez)
curl --cacert secrets/tls/ca.crt https://localhost/api/salud
```

Abre `https://localhost`. Para que el navegador no avise, confía en la CA (`secrets/tls/ca.crt`): instrucciones en
[`infra/tls/README.md`](infra/tls/README.md). Para activar los ataques en Docker pon `DEMO_MODE=true` en `.env` antes de
`docker compose up`. `docker compose down -v` detiene todo **y borra la base de datos**.

## Demo paso a paso

Todo lo siguiente sale del diseño (§9). Usa `https://localhost` (Docker) o `http://127.0.0.1:5173` (desarrollo).

1. **Entrar como admin** (`ADMIN_USERNAME` / `ADMIN_PASSWORD`). Desde la página no hay aún pantallas de administración:
   crea los usuarios por la API (en desarrollo cambia la URL por `http://localhost:3000`; con Docker añade
   `--cacert secrets/tls/ca.crt`):

   ```bash
   URL=http://localhost:3000
   curl -s -c admin.jar -H 'Content-Type: application/json' -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' $URL/api/auth/login
   curl -s -b admin.jar -H 'Content-Type: application/json' -d '{"username":"ana","password":"clave-de-ana-12345","rol":"registrador"}' $URL/api/usuarios
   curl -s -b admin.jar -H 'Content-Type: application/json' -d '{"username":"luisa","password":"clave-de-luisa-12345","rol":"auditor"}' $URL/api/usuarios
   ```

   (El login está limitado a 5 intentos por minuto por IP. `admin.jar` guarda la sesión: bórralo al terminar.)

2. **Registrador:** entra como `ana` → **Mi llave** → _Generar llave_ → _Registrar en el servidor_ (queda `pendiente`).
3. **Admin aprueba la llave:**

   ```bash
   curl -s -b admin.jar $URL/api/llaves/pendientes          # anota el "id" de la llave de ana
   curl -s -b admin.jar -X POST $URL/api/llaves/<id>/aprobar
   ```

4. **Agregar una persona** (como `ana`): **Personas** → llenar el formulario → _Crear persona_. El navegador firma el
   hash con la llave privada local; el servidor verifica la firma, mina el bloque y lo anexa. Se ve el nonce y el tiempo.
5. **Ver la cadena:** página **Cadena** (bloques conectados con hash anterior, nonce, firmante y llave).
6. **Verificar:** como `luisa` (auditor) o admin, página **Verificar** (o el botón _Verificar cadena_ en **Cadena**) →
   debe salir ✅ íntegra, con los 5 chequeos por bloque y el sello del servidor.
7. **Atacar** (con `DEMO_MODE=true`, como admin; toma antes un snapshot):

   ```bash
   curl -s -b admin.jar -X POST $URL/api/demo/snapshot
   curl -s -b admin.jar $URL/api/ataques                    # catálogo con lo que cada ataque debe detectar
   curl -s -b admin.jar -H 'Content-Type: application/json' -d '{"indice":1}' $URL/api/ataques/modificar-dato
   ```

   Vuelve a **Verificar**: ❌ en el bloque y chequeo esperados. Prueba los cinco ataques (`modificar-dato`,
   `modificar-cifrado`, `reescribir-cadena`, `truncar`, `reordenar`) y restaura entre uno y otro:

   ```bash
   curl -s -b admin.jar -X POST $URL/api/demo/restaurar
   ```

8. **Exportar y verificar fuera del sistema:** descarga la cadena y la llave pública del servidor y verifícalas con el
   CLI (ver abajo) o con la página pública **Verificador independiente** (`/verificador`), que no llama al servidor.
9. **Bitácora:** `GET /api/bitacora` (admin o auditor) registra todo lo anterior y su propia cadena de hashes es válida.

> Nota: la carga masiva desde CSV (H7.1) y las pantallas de administración (H9.4) se documentan aquí cuando se
> incorporen; hasta entonces los pasos de administración se hacen por la API como arriba.

## Guía de ataques

Los ataques simulan a alguien con acceso directo a la base de datos. Solo existen con `DEMO_MODE=true` y para el admin.

| Ataque              | Qué hace                                               | Qué lo detecta                                       |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `modificar-dato`    | Cambia el nombre de una persona directo en la tabla    | `hash_datos` del bloque de esa persona               |
| `modificar-cifrado` | Altera un texto cifrado (AES-GCM)                      | `hash_datos` y el descifrado (tag GCM)               |
| `reescribir-cadena` | Modifica un dato y recalcula todos los hashes y el PoW | la **firma del usuario** y el **sello del servidor** |
| `truncar`           | Borra el último bloque (la cadena parece válida)       | el **sello del servidor** (truncamiento)             |
| `reordenar`         | Intercambia dos bloques                                | el **enlace** `hash_anterior`                        |

Los detalles de la API de ataques, snapshot y restaurar, y el **ataque manual con `sqlite3`**
(`UPDATE Persona SET nombre='Mallory' WHERE id=1;`), están en [`apps/api/README.md`](apps/api/README.md#modo-demo-ataques-snapshot-y-restaurar-h6).

## Verificador CLI

```bash
npm run build
npx verificador cadena-AAAAMMDD-HHmm.json --server-key server-public.pem
```

`cadena-….json` sale de `GET /api/cadena/exportar` (admin o auditor) y `server-public.pem` de
`apps/api/secrets/server-public.pem` o `GET /api/cadena/llave-servidor` (la llave la fija quien verifica, por un canal
aparte). Código de salida: `0` íntegra, `1` comprometida, `2` error de uso. Más en
[`tools/verificador/README.md`](tools/verificador/README.md).

## Estructura del repositorio

| Ruta                | Qué es                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/core`     | `@bc/core`: serialización canónica, SHA-256, PoW y verificación. Isomórfica (Node y navegador).           |
| `apps/api`          | Servicio NestJS + Prisma + SQLite: autenticación y roles, cifrado AES-256-GCM, firmas, ataques, bitácora. |
| `apps/web`          | Interfaz React (Vite): personas, cadena, verificación, verificador local, llaves del usuario (WebCrypto). |
| `tools/verificador` | CLI que verifica un JSON exportado.                                                                       |
| `infra`             | CA propia (`infra/tls`) y configuración de nginx (`infra/nginx`).                                         |
| `docs`              | Diseño, backlog (`docs/backlog`) y guías.                                                                 |

## Seguridad (resumen)

SHA-256 e hash encadenado con prueba de trabajo; AES-256-GCM sobre dirección y teléfono; firmas ECDSA P-256 del usuario
(llave privada solo en su navegador) y sello ECDSA del servidor; login con argon2id y JWT en cookie `httpOnly`/`Secure`/
`SameSite=Strict`; roles con mínimo privilegio; `ValidationPipe` estricto, Prisma parametrizado, `helmet`, CORS
restringido y límite de intentos; secretos solo en `.env` y `secrets/` (ignorados por git). Las limitaciones conocidas
(rollback completo de la BD, confianza en el admin al aprobar llaves, cédula y nombre en claro, un solo servidor) están
en el diseño §7b.
