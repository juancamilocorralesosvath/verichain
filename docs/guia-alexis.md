# Guía para Alexis (y su agente): cómo terminar el proyecto

> Escrita el 12 de noviembre de 2026 por Juan Camilo y su agente. Léela completa **antes** de tocar código; después de
> esta guía lee `AGENTS.md`, el diseño (`docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md`) y la
> historia que vayas a hacer (`docs/backlog/<id>-*.md`). Cuando esta guía y el diseño difieran, **manda el diseño**.

## 1. Dónde estamos

**Hechas (38 de 39 historias, todas mezcladas en `main`, `npm run check` en verde):** núcleo criptográfico (E1), API base
(H2.x), autenticación, roles y usuarios (H3.1–H3.3), cifrado AES (H4.1, H4.2), llaves del usuario en el navegador y su
registro y aprobación (H5.1, H5.2), bloques firmados preparar → firmar → confirmar (H5.3), sello del servidor (H5.4),
módulo de ataques y restaurar demo (H6.1, H6.2), carga CSV por lotes (H7.1), bitácora (H7.2), exportar la cadena (H7.3),
CLI verificador (H8.1), verificador local (H8.2), web base, Personas y Cadena (H9.1, H9.2), página Verificar (H9.3),
páginas Admin, Bitácora y Exportar (H9.4), sistema visual (H10.1), cadena visual (H10.2), pulido y modo presentación (H10.3),
CA propia (H11.1), Docker Compose con TLS (H11.2), README (H12.1) y guion de sustentación (H12.3).

**Solo queda 1 historia pendiente** (el tablero es la fuente de verdad: `docs/backlog/README.md`):

- **H12.2** Informe final: programada para después del congelamiento del 20 de noviembre. Ver [`docs/plan-cierre.md`](plan-cierre.md).

Fechas: **congelamiento de funcionalidades el viernes 20 de noviembre** (desde ahí solo bugs), documentación el 21 y
ensayo el 22. Entrega asumida el 23.

## 2. Cómo levantar el entorno (una vez)

Requisitos: Node ≥ 22.12 (probado con 24), npm, `openssl` (solo para la CA), `sqlite3` opcional (guía de ataque manual).

```bash
git switch main && git pull
npm install
cp .env.example .env          # ignorado por git; nunca lo subas
```

Edita `.env` y completa (los demás valores por defecto sirven):

- `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
- `DATA_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (AES-256: 32 bytes en base64)
- `ADMIN_PASSWORD`: mínimo 12 caracteres (la usa el seed del admin; `ADMIN_USERNAME` ya trae `admin`)
- `DEMO_MODE=true` para ver ataques y restaurar (nunca en producción)

Luego, desde la raíz:

```bash
npm run llaves:servidor -w @bc/api   # llave de firma del servidor (apps/api/secrets/, modo 600; sin ella la API NO arranca)
npm run build -w @bc/core            # las apps consumen @bc/core ya compilado (los scripts pre* lo hacen solos)
cd apps/api && npx prisma migrate deploy && cd ../..    # crea apps/api/data/blockchain.db
npm run seed -w @bc/api              # crea el admin con ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev -w @bc/api               # API en http://localhost:3000
npm run dev -w @bc/web               # web en http://127.0.0.1:5173 (el proxy de Vite manda /api a la API)
```

Si tu base de datos es anterior a algún cambio grande (sellos, bitácora), empieza de cero borrando `apps/api/data/`:
una cadena sin sellos se considera comprometida a propósito.

**Flujo manual completo** (sirve para probar cualquier pantalla):

1. Entra como `admin` y crea un registrador y un auditor (`POST /api/usuarios`; aún no hay pantalla: la haces tú en H9.4).
2. Entra como el registrador → **Mi llave** → _Generar llave_ → _Registrar en el servidor_ (queda `pendiente`).
3. El admin aprueba la llave (`POST /api/llaves/:id/aprobar`, hoy por `curl`; pantalla en H9.4).
4. El registrador crea una persona en **Personas** (preparar → firmar en el navegador → confirmar) y la ve en **Cadena**.
5. Un auditor o admin verifica (`GET /api/cadena/verificar`) y exporta (`GET /api/cadena/exportar`).
6. Con `DEMO_MODE=true` el admin ataca (`POST /api/ataques/:id`), vuelve a verificar y restaura (`POST /api/demo/restaurar`).
7. Fuera del sistema: `npx verificador cadena.json --server-key apps/api/secrets/server-public.pem` (tras `npm run build`).

Credenciales y llaves de prueba: usa las tuyas; **nunca** pongas secretos reales en el repositorio, en los commits ni en
los mensajes de PR.

## 3. Mapa de la API (`/api`, JSON, cookie `sesion` httpOnly)

| Ruta                                                     | Roles                            | Qué hace / respuesta                                                                                                         |
| -------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /salud`                                             | público                          | `{ ok, coreVersion }`                                                                                                        |
| `POST /auth/login`                                       | público                          | `{ username, password }` → cookie y `{ username, rol }` (limitado a **5 por minuto** por IP)                                 |
| `POST /auth/logout`, `GET /auth/yo`                      | sesión                           | `yo` → `{ username, rol }`                                                                                                   |
| `GET /personas`                                          | registrador, auditor             | Registrador: datos **descifrados**; auditor: `***` + `direccion_cifrada`/`telefono_cifrado`; `integra`                       |
| `POST /bloques/preparar`                                 | registrador                      | `{ cedula, nombre, direccion, telefono }` → `{ borrador_id, hash_datos }` (borrador de 5 minutos)                            |
| `POST /bloques/confirmar`                                | registrador                      | `{ borrador_id, llave_id, firma_b64 }` → `{ indice, persona_id, hash_datos, hash_cadena }`                                   |
| `GET /cadena`                                            | sesión                           | Bloques por índice (`indice, persona_id, hash_datos, nonce, hash_anterior, hash_cadena, firma_usuario, llave_id, creado_en`) |
| `GET /cadena/verificar`                                  | admin, auditor                   | `ReporteCadena` (ver §4)                                                                                                     |
| `GET /cadena/exportar`                                   | admin, auditor                   | JSON `bc-export/1` con `Content-Disposition: attachment; filename="cadena-AAAAMMDD-HHmm.json"`                               |
| `GET /cadena/llave-servidor`                             | público                          | `{ pem, huella_sha256 }` (solo la pública)                                                                                   |
| `POST /llaves`                                           | registrador                      | `{ spki_b64 }` → llave `pendiente` (`id, version, estado, spki_b64, creado_en, aprobada_en`)                                 |
| `GET /llaves/mias`                                       | registrador                      | Mis llaves                                                                                                                   |
| `GET /llaves/pendientes`                                 | admin                            | Llaves pendientes con el `username` del dueño                                                                                |
| `POST /llaves/:id/aprobar` / `/rechazar`                 | admin                            | Solo desde `pendiente`; al aprobar, la anterior pasa a `reemplazada`                                                         |
| `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id` | admin                            | `{ id, username, rol, activo, creado_en }`; PATCH `{ activo?, rol? }`; el admin no se desactiva a sí mismo                   |
| `GET /bitacora?pagina=`                                  | admin, auditor                   | `{ entradas, pagina, totalPaginas, total, verificacion: { valida, primeraRota } }` (50 por página, recientes primero)        |
| `GET /ataques`, `POST /ataques/:id`                      | admin, **solo `DEMO_MODE=true`** | Catálogo `[{ id, nombre, descripcion, deteccionEsperada }]`; ejecutar con `{ indice? }` → `{ ejecutado, detalle }`           |
| `POST /demo/snapshot`, `/demo/restaurar`                 | admin, **solo `DEMO_MODE=true`** | `{ guardado, bloques }` / `{ restaurado, verificacion: ReporteCadena }`                                                      |

Errores: siempre `{ statusCode, mensaje }` genérico (sin trazas). 401 sin sesión, 403 rol incorrecto, 409 conflicto,
410 borrador expirado. Con `DEMO_MODE` apagado las rutas de ataques y demo **no existen** (404).

## 4. Piezas reutilizables

**`@bc/core`** (isomórfico, sin `node:*`; úsalo también en el navegador): `verificarCadena(bloques, opciones)` →
`ReporteCadena { valida, primerBloqueRoto, bloques: [{ indice, chequeos: { hashDatos, enlace, hashCadena, pow,
firmaUsuario }, motivos }], sello: { estado, motivos }, totalBloques }` (cada chequeo es `'ok' | 'falla' | 'no-aplica'`);
`parsearExportacion(json)`; `aOpcionesVerificacion(exportacion, { verificarFirma, llavePublicaServidor })` (la llave del
servidor **la fija quien verifica**, nunca la del archivo); `calcularHashDatos`, `minar`, `verificarBitacora`, `sha256Hex`.
Un `VerificadorFirma` es `(spkiB64, mensaje, firmaB64) => Promise<boolean>`: el de Node está en
`apps/api/src/cripto/verificador-firma.node.ts` y `tools/verificador/src/verificador-firma.ts`; el de WebCrypto lo
escribes tú en H8.2 (`importKey('spki', …, { name: 'ECDSA', namedCurve: 'P-256' })` y `verify({ name: 'ECDSA', hash:
'SHA-256' }, …)`; la firma es P1363 de 64 bytes, el mensaje son los bytes ASCII del string).

**Web (`apps/web/src`)**: `api/cliente.ts` (`solicitar<T>(ruta, opciones)`: `fetch` con `credentials: 'include'`,
`ErrorApi` con el `mensaje` de la API, evento `sesion-expirada` ante un 401); `sesion.tsx` (`useSesion()`: `usuario`,
`entrar`, `salir`); `App.tsx` (menú por rol en `enlaces`; el objeto `paginas` asigna componentes a rutas: las demás siguen
como _"Disponible próximamente"_; `/verificador` es pública); `cripto/llaves.ts` (`generarPar`, `firmarHashDatos`,
`exportarPublicaSpkiB64`, `huellaSpkiHex`, `crearRespaldo`, `importarRespaldo`) y `cripto/almacen.ts` (IndexedDB por
usuario); `validacion.ts`; páginas `Personas`, `Cadena`, `MiLlave` como ejemplo del estilo (estados de carga, error y
vacío, `role="alert"`, HTML semántico).

**Pruebas web** (`apps/web/test`): `ayudantes.tsx` → `simularApi({ 'GET /api/ruta': { status?, cuerpo } })` simula `fetch`
por método y ruta, `sesion('rol')` simula `/api/auth/yo`, `renderizar('/ruta')` monta `<App/>`, `llamadas(mock, método,
ruta)`. Para WebCrypto e IndexedDB en jsdom: `import 'fake-indexeddb/auto'` y `vi.stubGlobal('crypto', webcrypto)`
(de `node:crypto`; el tsconfig web no carga tipos de Node: `test/node-crypto.d.ts` declara lo mínimo). Ejemplos:
`personas.test.tsx`, `mi-llave.test.tsx`.

**Pruebas API** (`apps/api/test`): `crearBdTemporal()` da una BD propia y fija `POW_DIFFICULTY=2` y la llave del servidor
de prueba; `ayudantes-firma.ts` → `crearUsuario(app, nombre, rol)`, `crearFirmante(app, nombre)` (registrador con llave
aprobada), `crearPersonaFirmada(app, firmante, datos?)` (preparar → firmar → confirmar), `datosPersona()`,
`firmarConLlave`, `nuevoParEcdsa`. Cada archivo arma su `AppModule` con `Test.createTestingModule` y `configurarApp`.

## 5. Trampas que ya nos mordieron (léelas)

1. **SQLite tiene una sola conexión.** Nunca llames a otra consulta (ni a `BitacoraService.registrar`) _dentro_ de un
   `$transaction` interactivo de Prisma: se bloquea. Hazlo después de que la transacción termine.
2. **`DEMO_MODE` se evalúa al cargar `AppModule`.** En las pruebas fíjalo antes e importa el módulo con `await import()`.
3. **Las firmas ECDSA no son deterministas:** firmar dos veces el mismo mensaje da firmas distintas. Compara contra la
   firma que enviaste, no contra una recalculada.
4. **El login está limitado a 5 por minuto por IP** (y cada prueba que cree usuarios con `crearUsuario` consume uno).
5. **El hash de una persona se calcula sobre el texto cifrado** (IV aleatorio): por eso el borrador guarda la fila ya
   cifrada y no se puede "recalcular" después.
6. **Sin sello = cadena comprometida** (a propósito, en la API y en el CLI): si lo replicas en la web (H8.2), hazlo igual.
7. **`@bc/core` se consume compilado** (`dist/`). Si cambias `core`, `npm run build -w @bc/core`. La web **no depende hoy
   de `@bc/core`**: para H9.3 (tipos) y H8.2 (lógica) añade `"@bc/core": "*"` a `apps/web/package.json` y un `pretest` /
   `predev` que lo compile, como hace la API.
8. **`req.ip` detrás de nginx** sería la IP del contenedor: en H11.2 activa `trust proxy` en Express para que la bitácora
   y el throttler vean la IP real.
9. Para probar a mano, levanta API y web con BD y llaves **temporales** (variables `DATABASE_URL` y
   `SERVER_SIGNING_KEY_PATH` de proceso) y **detén los procesos al terminar** (puertos 3000 y 5173).
10. Seguridad (se evalúa): sin `dangerouslySetInnerHTML`, sin `any`, DTO con `class-validator` en toda entrada nueva de la
    API, nada de SQL crudo, secretos solo en `.env`/`secrets/`, errores genéricos al cliente, nunca datos personales ni
    secretos en la bitácora ni en los logs.

## 6. Flujo de trabajo por historia (obligatorio)

`git switch main` → `git pull` → `git switch -c h<épica>-<n>-<slug>` → **primer commit** reclama la historia
(`estado: en-curso`, `tomada_por: Alexis`, fecha, fila del tablero) → `git push -u origin <rama>` → `gh pr create --draft`
→ **pruebas primero** → implementar → `npm run check` en verde (y la sección "Verificación" de la historia) → prueba
manual con la app real si la historia lo pide → `estado: hecha`, tablero ("Disponibles ahora" y una nota "Decisiones
tomadas" en la historia) → `gh pr ready` → `gh pr merge --merge` → `git switch main && git pull` → siguiente.
Nunca se pushea directo a `main`. Si no terminas: "Notas de traspaso" en la historia, borra `tomada_por`, deja el PR en
borrador. Mensajes de commit en español y convencionales (`feat(web): …`, `test(api): …`, `chore(backlog): …`).

## 7. Tus seis historias, una por una

### H9.3 — Página Verificar (`apps/web`)

- **Ya existe:** `GET /api/cadena/verificar` (admin y auditor) y el menú con **Verificar** para auditor y admin.
- **Falta:** la ruta `/verificar` y el componente **`<ReporteVerificacion reporte={...} />`** (ponlo en
  `apps/web/src/componentes/`): veredicto global grande (✅ íntegra / ❌ comprometida) y primer bloque roto; por bloque los
  5 chequeos con estado y motivos; sección aparte para el sello del servidor; el primer bloque roto resaltado y
  visible sin scroll (con un enlace para ir a él). Botón "Verificar integridad".
- **Cuida:** el componente recibe solo el `ReporteCadena` (sin `fetch`): lo reutilizan H8.2 (verificación local) y
  H9.4/H10.2. Un bloque con `no-aplica` no es una falla. Estados de carga, error y vacío. Tipo del reporte: importa
  `ReporteCadena` de `@bc/core` (ver trampa 7).
- **Pruebas:** reporte íntegro (todo ok), reporte con un bloque roto (resaltado y primer roto), sello en falla,
  truncamiento (bloques ok pero sello en falla).

### H7.1 — Carga masiva CSV (`apps/api` + `apps/web`)

- **Ya existe:** `POST /api/bloques/preparar` (un registro) y `confirmar`; `CrearPersonaDto` con las reglas de validación.
- **Falta (API):** `POST /api/bloques/preparar-lote` (multipart, campo `archivo`; máx. 200 KB y 500 filas; solo CSV;
  encabezado exacto `cedula,nombre,direccion,telefono`; parser probado como `csv-parse`, **nunca** `split(',')`). Valida
  cada fila **con las mismas reglas** de `CrearPersonaDto` (reutiliza el validador con `plainToInstance` + `validate`),
  detecta cédulas duplicadas dentro del archivo y contra la BD, y responde `{ validas: [{ fila, borrador_id, hash_datos }],
invalidas: [{ fila, errores }] }`. `POST /api/bloques/confirmar-lote { items: [{ borrador_id, llave_id, firma_b64 }] }`
  confirma en orden con las mismas reglas de H5.3 y, si una falla, se detiene y reporta cuáles quedaron anexadas.
  Multipart: `FileInterceptor` de `@nestjs/platform-express` (instala `@types/multer`).
- **Falta (web):** en Personas, subir el CSV → mostrar válidas e inválidas → "Firmar y anexar N" (firma todos los
  `hash_datos` con la llave local) → confirmar. Y `docs/ejemplos/personas.csv` (~10 filas ficticias + 2 inválidas).
- **Cuida:** `confirmar` verifica **toda** la cadena antes de cada anexo (O(n)): con 500 filas puede tardar. Mídelo; si
  hace falta, verifica una vez por lote y deja el chequeo del sello por anexo, y anótalo como decisión. Registra **una**
  entrada de bitácora por lote (no 500) con `BitacoraService` (después de terminar, nunca dentro de una transacción).
  Rechaza archivos con `Content-Type` o extensión incorrectos y celdas enormes. No guardes el archivo en disco.
- **Pruebas:** fila inválida → va a `invalidas` y no genera borrador; duplicada en el archivo y contra la BD; límites de
  tamaño y filas; encabezado incorrecto; flujo completo con N firmas; falla a mitad de lote.

### H8.2 — Verificador web local (`apps/web`)

- **Ya existe:** el formato `bc-export/1`, `parsearExportacion`, `aOpcionesVerificacion`, el CLI como referencia
  (`tools/verificador/src/ejecutar.ts`) y fixtures reales: `tools/verificador/test/fixtures/` (cadena válida, alterada y
  dos PEM públicos).
- **Falta:** la ruta pública **`/verificador`** (sin login): subir `cadena.json` y `server-public.pem`; verificar en el
  navegador con `@bc/core` + un `VerificadorFirma` de WebCrypto; mostrar el reporte con `<ReporteVerificacion>` (H9.3) y
  **advertir si la huella de la llave fijada no coincide** con la del archivo (siempre se usa la fijada). Sin sello en el
  archivo = comprometida.
- **Cuida:** **ningún `fetch` durante la verificación** (el mensaje de la sustentación es "no hace falta confiar en el
  servidor"): una prueba debe espiar `fetch` y comprobar que no se llama. La dificultad viene del archivo: muéstrala.
  Convierte el PEM a SPKI DER en base64 sin librerías pesadas; huella con `crypto.subtle.digest('SHA-256', …)`.
- **Pruebas:** con los fixtures (válida → íntegra; alterada → comprometida y bloque 2; PEM distinto → advertencia y sello
  en falla); archivo inválido o formato desconocido → mensaje claro.

### H9.4 — Páginas de administración, bitácora, CSV y exportar (`apps/web`)

- **Ya existe todo en la API** (ver §3). Hoy las rutas `/usuarios`, `/llaves`, `/ataques`, `/bitacora`, `/exportar`,
  `/verificar` están en el menú como _"Disponible próximamente"_ (objeto `paginas` de `App.tsx`).
- **Falta:** **Usuarios** (listar, crear, activar/desactivar, cambiar rol); **Llaves** (pendientes con aprobar/rechazar y la
  huella SHA-256 de cada llave: usa `huellaSpkiHex`); **Ataques** (solo si la API los expone: si `GET /api/ataques` da 404,
  no mostrar la sección; catálogo con botón por ataque y selector de índice, "Tomar snapshot", "Restaurar demo" y
  "Verificar ahora" con `<ReporteVerificacion>`); **Bitácora** (admin y auditor: tabla paginada y estado de integridad con
  `verificacion`); **CSV** (viene de H7.1, dentro de Personas); **Exportar** (admin y auditor: descargar el JSON,
  descargar `server-public.pem` a partir de `GET /api/cadena/llave-servidor` y mostrar la huella).
- **Cuida:** en `App.tsx` **Exportar** hoy solo lo ve el auditor y el diseño dice admin y auditor: corrígelo. Cada pantalla
  con estados de carga, error y vacío. Confirma antes de acciones destructivas de la demo (restaurar). La descarga del
  JSON debe conservar el nombre de `Content-Disposition`. Puedes hacerla "por partes" (varios PRs pequeños).
- **Pruebas:** una por pantalla con `simularApi`; que cada rol vea solo lo suyo (el menú ya lo cubre).

### H11.2 — Docker Compose con nginx y TLS (infra)

- **Ya existe:** `infra/tls/generar-ca.sh` crea la CA y el certificado de `localhost` en `secrets/tls/` (H11.1).
- **Falta:** `apps/api/Dockerfile` (multi-stage, `node:<LTS>-slim`, usuario no root, solo dependencias de producción, corre
  `prisma migrate deploy` al arrancar), `apps/web/Dockerfile` (build y estáticos en nginx), `docker-compose.yml` con `api`
  (sin puertos al host) y `web` (nginx: 443 y 80 → 443; `try_files` hacia `index.html`; proxy de `/api` → `api:3000`; solo
  TLS 1.2/1.3 y HSTS; certificado y llave montados de solo lectura), volúmenes `api-data` (BD) y `secrets/` de solo
  lectura (llave del servidor), variables desde `.env`, `NODE_ENV=production` (la cookie lleva `secure`) y `.dockerignore`
  (excluye `node_modules`, `secrets` y `.env`).
- **Cuida (nos va a pasar):** el contexto de build es la **raíz del monorepo** (workspaces y `@bc/core` compilado); la API
  necesita **`prisma` en tiempo de ejecución** para migrar (hoy es dependencia de desarrollo: muévela o cópiala) y
  `prisma generate` en el build; `better-sqlite3` es un módulo nativo (la imagen `slim` suele servir con binario
  precompilado; si no, hay que compilar); `DATABASE_URL` y `SERVER_SIGNING_KEY_PATH` con rutas absolutas del contenedor;
  el seed del admin (`node dist/auth/ejecutar-seed.js`) hay que ejecutarlo una vez; `WEB_ORIGIN=https://localhost`;
  **`trust proxy`** (trampa 8). Nada de secretos en la imagen ni en el compose.
- **Verificación:** `docker compose up --build` → `https://localhost` (con la CA confiada) → login como admin → flujo
  completo; `docker compose down -v` limpia. Anota los comandos exactos para el README (H12.1).

### H10.1 — Sistema visual (`apps/web`)

- **Ya existe:** HTML semántico y clases simples (`bloque`, `genesis`, atributos `data-integra`), **sin estilos**.
- **Falta:** una estética coherente con el tema (seguridad, integridad, "libro mayor"; el skill `frontend-design` ayuda);
  tokens CSS (colores, tipografía, espaciado, radios), colores semánticos `--ok`, `--falla`, `--no-aplica` con contraste AA,
  tipografía monoespaciada para hashes; componentes base en `apps/web/src/ui/` (Botón, Campo, Tabla, Tarjeta, Insignia de
  estado, **Hash** —abrevia, copia al portapapeles y tooltip con el valor completo— y Alerta); tema claro obligatorio.
- **Cuida:** **no cambia la API ni la lógica**: solo marcado y estilos. Las pruebas existentes consultan por rol, nombre
  accesible y texto (`getByRole`, `getByLabelText`, `data-integra`): no las rompas. Usable a 1280 px (proyector) y a 375 px.

## 8. Cierre del proyecto (después de tus seis, o repartido con nosotros)

- **H10.2** — Cadena como bloques conectados (tarjetas con flechas, `hash_anterior → hash_cadena`, nonce, firmante,
  estado); tras verificar, cada bloque se colorea y la conexión rota se resalta; indicador de "minando…". `confirmar`
  responde hoy `{ indice, persona_id, hash_datos, hash_cadena }`: si necesitas `{ intentos, ms }`, `minar` de core ya los
  devuelve (`anexarBloqueTx`); anótalo.
- **H10.3** — Aplicar el sistema visual a todo, modo presentación (tipografía grande para el proyector) y, en Ataques, una
  tarjeta "Qué se espera detectar" por ataque (el catálogo ya trae `deteccionEsperada`); revisar estados vacío/error/carga.
- **H12.1** — `README.md` en la raíz: qué es, requisitos, instalación en desarrollo (§2 de esta guía, con los comandos
  reales) y con Docker (CA → `docker compose up`), demo paso a paso (diseño §9), guía de ataques (UI y `sqlite3`, ya
  escrita en `apps/api/README.md`), verificador CLI (`tools/verificador/README.md`) y estructura del repo.
- **H12.3** — `docs/sustentacion.md`: guion cronometrado con quién habla, checklist previa (BD limpia y snapshot tomado,
  CA confiada en el equipo del proyector, `DEMO_MODE=true`, llave del registrador importada y aprobada), preguntas
  probables con respuesta corta ("¿qué pasa si el atacante recalcula todos los hashes?", "¿por qué hashear el
  ciphertext?", "¿qué no detecta su sistema?") y plan B si falla Docker.
- **H12.2** — Informe (`docs/informe/`), **después del congelamiento**. Limitaciones y riesgos aceptados que ya conocemos:
  rollback completo de la BD (es lo que hace "Restaurar demo"; también restaura usuarios y bitácora), confianza en el admin
  al aprobar llaves, cédula y nombre en claro, un solo servidor, borrar entradas del **final** de la bitácora no se detecta
  con el encadenamiento solo, el PoW del verificador usa la dificultad que trae el archivo (la protección fuerte es el
  sello), `npm audit` (avisos moderados de `minimatch` solo en herramientas de lint) y una llave extraíble en IndexedDB
  queda al alcance de un XSS (mitigado con la CSP de helmet y sin `dangerouslySetInnerHTML`).

## 9. Antes de entregar (lista de comprobación, diseño §9)

1. `npm run check` en verde en `main` limpio y sincronizado.
2. `docker compose up` → `https://localhost` con la CA confiada → login como admin.
3. Crear un registrador, que genere su llave, el admin la apruebe, agregar una persona y cargar el CSV de ejemplo: la
   cadena muestra los bloques con PoW y firma.
4. Verificar → todo ✅.
5. Ejecutar cada ataque → verificar → ❌ en el bloque y el chequeo esperados → restaurar.
6. Exportar → `npx verificador cadena.json --server-key server-public.pem` y la página `/verificador` dan el mismo
   resultado que el servidor.
7. La bitácora registró todo lo anterior y su propia cadena es válida.

Si algo de esta guía no coincide con el código, **confía en el código y en las pruebas**, y corrige la guía en tu PR.
