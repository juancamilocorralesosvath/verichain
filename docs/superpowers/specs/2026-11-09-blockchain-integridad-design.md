# Diseño: Simulación de Blockchain con integridad verificable

> Proyecto final de Ciberseguridad (Icesi, Prof. Juan Manuel Madrid). Equipo de 2 personas, 2 semanas.
> Tras aprobación, este documento se copia a `docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md` en la carpeta del proyecto.

## 1. Intención y porqué

El enunciado (proyecto 7) pide una blockchain sencilla construida a partir de una tabla de personas (cédula, nombre, dirección, teléfono): arranca con un bloque génesis, agrega un bloque por cada registro, cada bloque lleva `SHA-256(datos)` y un hash acumulado de todos los bloques ("hash de los hashes"), se pueden crear filas nuevas y se puede verificar la integridad recalculando los hashes en vivo.

El proyecto se evalúa con **OT1** (diseñar e implementar un servicio que garantice confidencialidad / integridad / disponibilidad) y **OT3** (buenas prácticas de codificación segura). Por eso el producto no se limita a "funcionar": debe **demostrar en vivo** que detecta manipulaciones, y exponer de forma explícita los servicios de seguridad vistos en clase: integridad (SHA-256), confidencialidad (AES), autenticación y control de acceso, no repudio (firmas digitales con curvas elípticas) y codificación segura.

**El éxito** es una sustentación en la que se agrega un registro, se ataca la base de datos de varias maneras y el sistema señala exactamente qué se rompió y por qué, y además cada decisión de seguridad tiene una justificación ligada al curso.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**

- Cumplir al pie de la letra el enunciado (núcleo, sección 4).
- Extras, todos incluidos: simulación de ataques, sello digital del servidor, login con roles, cifrado AES de campos sensibles, no repudio por firma del usuario, carga CSV, verificador independiente, bitácora de auditoría, prueba de trabajo (PoW), HTTPS con CA propia y Docker Compose.

**No-objetivos**

- Red P2P, nodos múltiples o consenso distribuido. Hay **un solo servidor**.
- Editar o borrar registros desde la aplicación. La cadena es _append-only_ (solo se agregan bloques). Las únicas alteraciones vienen del módulo de ataques.
- Despliegue en la nube y uso de Hyperledger.

**Anti-objetivos** (lo harían fracasar aunque "funcione")

- Que el navegador calcule y "confíe" en hashes que el servidor no recalcula.
- Que la verificación compare contra valores que el mismo atacante pudo reescribir, sin una capa de firma que lo delate.
- Que la serialización no sea determinista y la verificación falle sin que haya ataque.
- Secretos (llaves, contraseñas) dentro del repositorio.

## 3. Stack y estructura (decidido)

- **Backend:** NestJS (TypeScript) + Prisma + **SQLite**. SQLite también permite la demo de manipulación "manual" con la CLI `sqlite3`.
- **Frontend:** React + Vite + TypeScript.
- **Monorepo** con npm workspaces:
  - `apps/api`: servicio NestJS.
  - `apps/web`: interfaz React.
  - `packages/core`: lógica pura y compartida (serialización canónica, SHA-256, PoW, verificación de cadena y de firmas). La usan la API, el verificador del navegador y el CLI, así hay **una sola** implementación de la verificación.
  - `tools/verificador`: CLI Node que verifica un JSON exportado.
- **Criptografía:** módulo `crypto` de Node en el servidor y WebCrypto en el navegador. Nada de criptografía "hecha a mano".

## 4. Núcleo (requisito del enunciado)

### Modelo de datos

- **`personas`** (la "tabla de datos"): `id`, `cedula` (única), `nombre`, `direccion_cifrada`, `telefono_cifrado`, `creado_en`, `creado_por`.
- **`bloques`**: `indice`, `persona_id` (null en el génesis), `hash_datos`, `nonce`, `hash_anterior`, `hash_cadena`, `firma_usuario`, `creado_en`.
- Los datos **no se duplican** en el bloque. La verificación recalcula `hash_datos` a partir de la fila actual de `personas`, que es literalmente "calcular los hashes en vivo y compararlos con los almacenados".

### Hashes

- **Serialización canónica:** JSON con un orden fijo de campos, UTF-8, sin espacios y con la fecha en ISO-8601 UTC: `{cedula, nombre, direccion_cifrada, telefono_cifrado, creado_en, creado_por}`. Vive en `packages/core`.
- `hash_datos = SHA-256(canónico)` en hex.
- `hash_cadena_i = SHA-256(hash_cadena_{i-1} ‖ hash_datos_i ‖ nonce_i)`. Es el "hash de los hashes": encadena todos los bloques anteriores y el actual.
- **Génesis:** índice 0, datos fijos `"GENESIS"`, `hash_anterior` = 64 ceros. Se crea automáticamente si la cadena está vacía.

### Funciones

- Crear una fila: el backend valida, cifra, crea el bloque y lo agrega a la cadena.
- Ver la tabla y ver la cadena.
- **Verificar:** recorre toda la cadena y produce un reporte por bloque con cada chequeo (sección 5.8), el estado global ✅/❌ y el primer bloque roto.

## 5. Extras

### 5.1 Cifrado de datos sensibles (Unidad 2: AES)

- `direccion` y `telefono` se cifran con **AES-256-GCM**. La llave viene de una variable de entorno (`DATA_KEY`) y nunca va a la BD ni al repo. Cada campo lleva un IV aleatorio de 12 bytes y se guarda como `base64(iv‖tag‖ciphertext)`.
- **El hash se calcula sobre el texto cifrado.** Ventajas: el verificador independiente comprueba la integridad sin ver datos personales, y no se exponen hashes de datos de baja entropía (un teléfono se podría adivinar por fuerza bruta a partir de su hash).
- `cedula` y `nombre` van en claro. Es una limitación consciente que se menciona en el informe.
- Solo los roles autorizados ven los campos descifrados en la interfaz.

### 5.2 Login y roles (Unidad 3)

- Usuario y contraseña con hash **argon2id**. Sesión con JWT de vida corta en una cookie `httpOnly`, `Secure` y `SameSite=Strict`.
- Bloqueo o limitación de intentos de login (throttler).
- Roles:
  - **admin:** gestiona usuarios y es el único con acceso al módulo de ataques.
  - **registrador:** crea filas y carga CSV.
  - **auditor:** verifica, exporta y ve la bitácora.
- El admin inicial se crea con un _seed_ a partir de variables de entorno.

### 5.3 No repudio: firma del usuario en cada bloque (Unidad 2: curvas elípticas)

- Cada registrador tiene un par de llaves **ECDSA P-256** que se genera **en el navegador** (WebCrypto). La llave privada nunca sale del navegador: se guarda en IndexedDB y se puede descargar como respaldo. La llave pública se registra en el servidor.
- **Flujo en dos pasos:**
  1. `POST /bloques/preparar`: el servidor valida, cifra, fija `creado_en` y `creado_por`, guarda un borrador temporal y devuelve `hash_datos`.
  2. El navegador firma `hash_datos`.
  3. `POST /bloques/confirmar`: el servidor verifica la firma con la llave pública del usuario y recién ahí calcula el PoW y agrega el bloque.
- **Por qué así:** el servidor **no puede** firmar en nombre del usuario, de modo que el usuario no puede negar que creó el registro.
- Los borradores expiran a los pocos minutos.

### 5.4 Sello digital del servidor (Unidad 2: firmas)

- Cada vez que se agrega un bloque, el servidor firma `(indice_ultimo ‖ hash_cadena_ultimo)` con su propia llave ECDSA. La llave está en un archivo PEM fuera de la BD, montado como secreto.
- **Qué detecta:** que alguien con acceso solo a la BD altere un dato y **recalcule todos los hashes**, o que **borre los últimos bloques** (truncamiento). Ninguna de las dos cosas se detecta solo con hashes.

### 5.5 Prueba de trabajo (minado)

- `hash_cadena` debe empezar con N ceros en hex. N es configurable (por defecto 4) para que la demo sea ágil.
- La interfaz muestra el nonce y el tiempo de minado.
- **Explicación para la sustentación:** el PoW encarece reescribir la cadena, aunque en un solo servidor la protección fuerte la dan las firmas.

### 5.6 Carga masiva desde CSV

- El registrador sube un CSV con las columnas `cedula,nombre,direccion,telefono`.
- Validación por fila con límites de tamaño y de número de filas. Las filas inválidas se reportan y no se insertan.
- Firma por lotes: el servidor prepara N borradores, el navegador firma los N hashes y se confirman en orden.

### 5.7 Simulación de ataques (solo admin y solo con `DEMO_MODE=true`)

Escenarios con botón, cada uno explicando qué chequeo lo detecta:

1. Modificar un campo de una persona directo en la tabla → falla `hash_datos`.
2. Modificar un texto cifrado → falla `hash_datos` y además falla el descifrado GCM.
3. Modificar un dato **y recalcular todos los hashes y el PoW** → los hashes cuadran, pero fallan la firma del usuario y el sello del servidor.
4. Borrar el último bloque → la cadena parece válida, pero falla el sello (truncamiento).
5. Intercambiar el orden de dos bloques → falla el enlace `hash_anterior`.

Además: un botón **"Restaurar demo"** (snapshot de la BD) y una guía en el README para hacer el ataque 1 a mano con `sqlite3`.

### 5.8 Reporte de verificación

Por cada bloque: `hash_datos` recalculado vs. guardado, enlace con el anterior, `hash_cadena` recalculado, cumplimiento del PoW y firma del usuario válida. Globalmente: sello del servidor válido y coincidencia con el último bloque. Debe mostrar el **primer** bloque roto y el motivo en lenguaje claro.

### 5.9 Verificador independiente

- `GET /cadena/exportar` (auditor) devuelve un JSON con los bloques, las filas con los campos cifrados (sin descifrar), las llaves públicas de los usuarios, el sello y la llave pública del servidor.
- Se verifica de dos formas, ambas con `packages/core`: (a) el CLI `tools/verificador` (`npx verificador cadena.json`) y (b) una página del frontend que verifica el archivo **localmente en el navegador**.
- **Mensaje para la sustentación:** "no hace falta confiar en el servidor para comprobar la integridad".

### 5.10 Bitácora de auditoría

- Tabla `bitacora` _append-only_: usuario, acción (login, login fallido, crear, CSV, verificar, exportar, ataque, restaurar), resultado, IP y fecha. La ve el auditor.
- La bitácora va **encadenada con hash** igual que los bloques. Es barato con `packages/core` y protege también el registro de auditoría.

### 5.11 HTTPS con CA propia y Docker

- Un script con `openssl` crea una CA raíz propia y un certificado para `localhost` (Unidad 3: autoridad de certificación).
- `docker compose up` levanta la API, el frontend compilado y nginx como terminador TLS, que sirve la interfaz y redirige `/api`. Los secretos van en `.env`, con un `.env.example` en el repo.

## 6. Codificación segura (OT3): lista para el informe

- `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`. DTOs con expresiones regulares: cédula de 6 a 10 dígitos, teléfono numérico, longitudes máximas.
- Prisma usa consultas parametrizadas, así que no hay inyección SQL. React escapa la salida y no se usa `dangerouslySetInnerHTML` (contra XSS).
- `helmet` para cabeceras seguras, CORS restringido al origen del frontend y `@nestjs/throttler`.
- Errores genéricos hacia el cliente, sin trazas de pila. Los detalles van a la bitácora y los logs.
- Ningún secreto en el código. Llaves y contraseñas en `.env` y montajes. `npm audit` en el informe.
- CSV: límites de tamaño y prevención de _CSV injection_ (las celdas que empiezan con `= + - @` se neutralizan al exportar).
- Comparación de hashes y firmas con las funciones de la librería (`timingSafeEqual` donde aplique).
- Pruebas unitarias (Jest/Vitest) para `packages/core`: determinismo de la serialización, cada escenario de ataque detectado y una cadena íntegra que pasa.

## 7. Interfaz (páginas)

Login · Personas (tabla + formulario + carga CSV) · Cadena (bloques conectados visualmente con hashes, nonce, firmante) · Verificar (reporte con verde/rojo por bloque) · Bitácora · Verificador independiente (subir JSON) · Admin (usuarios + ataques + restaurar demo). Interfaz en español.

## 7b. Decisiones adicionales (tomadas por Claude, revisables)

**Matriz de permisos** (mínimo privilegio + separación de funciones):

| Acción                                           | admin                 | registrador | auditor                            |
| ------------------------------------------------ | --------------------- | ----------- | ---------------------------------- |
| Gestionar usuarios / aprobar llaves              | ✅                    | –           | –                                  |
| Crear filas / cargar CSV                         | –                     | ✅          | –                                  |
| Ver tabla con dirección/teléfono **descifrados** | –                     | ✅          | – (ve cifrado o enmascarado `***`) |
| Ver cadena (hashes, firmas)                      | ✅                    | ✅          | ✅                                 |
| Verificar / exportar JSON                        | ✅                    | –           | ✅                                 |
| Ver bitácora                                     | ✅                    | –           | ✅                                 |
| Ataques / restaurar demo                         | ✅ (solo `DEMO_MODE`) | –           | –                                  |

Razón: el auditor comprueba la integridad sin necesidad de ver datos personales, y el admin no crea registros, de modo que nadie hace todo solo.

**Ciclo de vida de las llaves del usuario**

- Cada llave pública tiene un `id` y una versión, y cada bloque guarda el `llave_id` con que se firmó. Las llaves viejas nunca se borran, así los bloques antiguos siguen verificando.
- Registrar una llave o rotarla (por pérdida o cambio de navegador) **requiere aprobación del admin** y queda en la bitácora encadenada.
- El respaldo descargable de la llave privada va **cifrado con contraseña**: PBKDF2 + AES-GCM en el navegador.
- Limitación declarada en el informe: quien controle el servidor y la BD podría registrar una llave falsa. Se mitiga con la aprobación del admin y la bitácora, pero no se elimina en un sistema de un solo servidor.

**Sello del servidor y anexos después de un ataque**

- Antes de cada anexo, el servidor **verifica la cadena y el sello**. Si fallan, **rechaza escribir** y pone el sistema en "cadena comprometida" hasta restaurar. Así un ataque no queda "lavado" por un sello nuevo.
- El sello se guarda en la BD (tabla `sellos`, histórico). El _rollback_ completo (volver a un par cadena + sello antiguo) es un riesgo **aceptado y documentado**. Como trabajo futuro se menciona anclar el sello afuera, por ejemplo publicarlo periódicamente. "Restaurar demo" es justamente ese rollback, y se explica así en la sustentación.

**El verificador independiente no confía en el JSON para la llave del servidor**

- La llave pública del servidor se entrega **aparte** (`server-public.pem`) y su huella SHA-256 se muestra en la interfaz y en el README.
- El CLI se usa como `verificador cadena.json --server-key server-public.pem`. La página web pide los dos archivos o compara la huella. Si el JSON trae una llave distinta, gana la fijada y se avisa.

**Orden de construcción** (cada fase termina con una demo funcionando):

1. `core` con pruebas + API básica (génesis, crear, verificar) + interfaz mínima.
2. Login, roles y AES.
3. Firma del usuario en dos pasos + sello + PoW.
4. Ataques + reporte de verificación completo.
5. CSV, bitácora, exportación y verificadores.
6. Docker, HTTPS con CA propia, pulido e informe.

## 8. Lo que queda a criterio del constructor

Nombres exactos de endpoints y módulos Nest y formato exacto del snapshot para "Restaurar demo". El **diseño visual** es una épica aparte (E10): primero se construye una interfaz funcional sin estilos elaborados y después se le aplica el diseño. Cualquiera de los dos integrantes la puede tomar.

## 10. Forma de trabajo (2 personas, sin asignación fija)

El equipo son 2 personas (Juan Camilo y Alexis). **Nadie tiene tareas fijas**: quien esté libre ese día avisa al otro ("hoy le meto yo") y toma las siguientes historias disponibles. Para que esto funcione sin pisarse:

- **El backlog vive en el repo:** `docs/backlog/`, con un archivo por historia (`H1.2-serializacion-canonica.md`) y frontmatter:
  - `id`, `epica`, `depende_de: [..]`, `estado: pendiente | en-curso | hecha`, `tomada_por`, `fecha`.
  - `docs/backlog/README.md` tiene el tablero resumido y el grafo de dependencias.
- **Tomar una historia** = `git switch main && git pull` → crear la rama de la historia desde `main` → ponerla en `en-curso` con tu nombre en el primer commit → push y PR en borrador **antes** de empezar. Solo se toman historias cuyas dependencias ya estén en `hecha`. Si los dos trabajan el mismo día, cada uno toma una historia distinta que no dependa de la otra (el grafo muestra cuáles van en paralelo).
- **Una rama por historia** (`h1-2-serializacion-canonica`). Se mezcla a `main` **por Pull Request** y solo con las pruebas en verde; nunca se hace push directo a `main`. **`main` siempre funciona.**
- **Si no terminas:** dejas una sección "Notas de traspaso" en el archivo de la historia (qué quedó hecho, qué falta, qué se rompió), haces push de la rama y la historia queda `en-curso` sin dueño. El otro la retoma desde ahí.
- **Tamaño:** cada historia debe caber en una sesión de trabajo de 2 a 4 horas con un agente.
- **Contexto para los agentes:** `AGENTS.md` (y `CLAUDE.md` que lo importa) en la raíz, con el stack, los comandos, las convenciones, la regla de "lee el diseño y tu historia antes de codificar" y el flujo de arriba. Este documento de diseño queda en `docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md`.

## 11. Cronograma (lun 9 nov → dom 22 nov 2026)

El cronograma marca **qué debe estar hecho cada día**, no quién lo hace. Si un día nadie trabaja, el siguiente día disponible se pone al corriente. Se asume la entrega el 23 de noviembre; si la fecha real es otra, se corre todo.

| Fecha  | Meta del día (épicas)                                                           | Hito                                              |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Lun 9  | E0 Fundaciones                                                                  | Repo con monorepo, AGENTS.md y backlog            |
| Mar 10 | E1 Núcleo criptográfico                                                         | `core` probado: hashes, PoW, verificación         |
| Mié 11 | E2 API de la cadena + E9.1 interfaz funcional base                              | **Demo 1:** crear persona → bloque → verificar ✅ |
| Jue 12 | E3 Autenticación y roles                                                        | Login y permisos                                  |
| Vie 13 | E4 Cifrado AES                                                                  | Datos sensibles cifrados                          |
| Sáb 14 | E5 Firmas, sello y PoW (parte 1)                                                | Llaves en el navegador                            |
| Dom 15 | E5 (parte 2)                                                                    | **Demo 2:** bloques firmados y sellados           |
| Lun 16 | E6 Ataques y reporte                                                            | 5 ataques detectados                              |
| Mar 17 | E7 CSV, bitácora y exportación                                                  | Carga masiva y auditoría                          |
| Mié 18 | E8 Verificador independiente                                                    | **Demo 3:** todo el alcance funcional             |
| Jue 19 | E11 Docker + HTTPS · E10 Diseño visual                                          | `docker compose up` con https                     |
| Vie 20 | E10 (cierre) + **congelamiento de funcionalidades** + prueba del guion completo | Solo arreglos de bugs desde aquí                  |
| Sáb 21 | E12 Informe y README                                                            | Informe con la sección de codificación segura     |
| Dom 22 | E12 Ensayo de sustentación + colchón                                            | Listo para entregar                               |

## 12. Épicas e historias (para agentes de IA)

**Formato de cada historia en `docs/backlog/`** (todas lo siguen, para que un agente la ejecute sin preguntar):

```
---
id: H1.2
epica: E1
depende_de: [H0.1]
estado: pendiente
tomada_por:
fecha:
---
# H1.2 — Serialización canónica
## Contexto        (1-3 líneas + secciones del diseño que debe leer, ej. "§4 Hashes")
## Objetivo        (qué existe al terminar)
## Archivos        (dónde crear / modificar)
## Criterios de aceptación   (lista verificable, cada uno comprobable con un test o un comando)
## Verificación    (comandos exactos: `npm test -w packages/core`)
## Fuera de alcance (lo que NO debe hacer)
## Notas de traspaso (se llena si queda a medias)
```

Reglas para el agente (van en AGENTS.md): no tocar archivos de otra historia sin anotarlo; si una decisión no está en el diseño, tomar la más simple y anotarla en "Notas de traspaso"; no marcar `hecha` sin la verificación en verde.

Listado (los criterios detallados se escriben en cada archivo al crear el backlog en E0):

**E0 — Fundaciones**

- H0.1 Monorepo npm workspaces (`apps/api`, `apps/web`, `packages/core`, `tools/verificador`), TypeScript estricto, ESLint y Prettier, scripts raíz `test`, `lint`, `dev`. _Dep: –_
- H0.2 `AGENTS.md` + `CLAUDE.md`, copia del diseño en `docs/`, `.env.example` y `.gitignore` (secretos, llaves, BD). _Dep: H0.1_
- H0.3 Crear los archivos de todas las historias en `docs/backlog/` con criterios detallados + README con tablero y grafo de dependencias. _Dep: H0.2_

**E1 — Núcleo criptográfico (`packages/core`)**

- H1.1 Serialización canónica determinista + pruebas (el mismo objeto con las llaves en otro orden da los mismos bytes). _Dep: H0.1_
- H1.2 `hashDatos`, `hashCadena` y bloque génesis + pruebas. _Dep: H1.1_
- H1.3 PoW (`minar(prev, hashDatos, dificultad)` → nonce) + pruebas. _Dep: H1.2_
- H1.4 `verificarCadena(bloques, filas, llaves, sello)` → reporte por bloque (§5.8). Las firmas se inyectan como funciones para que sirva en Node y en el navegador. Pruebas de los 5 escenarios de ataque. _Dep: H1.3_

**E2 — API de la cadena**

- H2.1 NestJS base: Prisma + SQLite, esquema `personas`/`bloques`, `ValidationPipe` global, helmet, CORS, throttler, filtro de errores genérico. _Dep: H0.1_
- H2.2 Génesis automático + `POST /personas` (todavía sin firma ni cifrado) + `GET /personas` + `GET /cadena`. Usa `core`. _Dep: H2.1, H1.3_
- H2.3 `GET /cadena/verificar` con el reporte de `core`. Pruebas e2e. _Dep: H2.2, H1.4_

**E3 — Autenticación y roles**

- H3.1 Usuarios con argon2id, login/logout, JWT en cookie httpOnly, throttler en el login, _seed_ del admin. _Dep: H2.1_
- H3.2 Guard de roles + aplicar la matriz de §7b a todos los endpoints. Pruebas e2e por rol. _Dep: H3.1, H2.3_
- H3.3 CRUD de usuarios (solo admin). _Dep: H3.2_

**E4 — Confidencialidad**

- H4.1 Servicio AES-256-GCM (`DATA_KEY`) + cifrar dirección y teléfono al crear + `hash_datos` sobre el cifrado. _Dep: H2.2_
- H4.2 Respuestas según el rol: el registrador recibe descifrado y el auditor/admin enmascarado. Si falla el tag de GCM, se marca como corrupto. _Dep: H4.1, H3.2_

**E5 — No repudio, sello y PoW integrado**

- H5.1 Web: generar ECDSA P-256 en WebCrypto, guardarla en IndexedDB, respaldo cifrado con contraseña (PBKDF2 + AES-GCM) e importarlo. _Dep: H9.1_
- H5.2 API: registrar y rotar llaves públicas con `llave_id` y versión, aprobación del admin. _Dep: H3.2_
- H5.3 Flujo `preparar` → firmar → `confirmar` (borradores con expiración, verificar firma, minar, anexar). _Dep: H5.1, H5.2, H4.1_
- H5.4 Sello del servidor (llave PEM fuera de la BD, tabla `sellos`) + verificar cadena y sello antes de anexar (rechazar y entrar en "cadena comprometida"). _Dep: H5.3_

**E6 — Ataques y reporte**

- H6.1 Módulo de ataques (`DEMO_MODE` + admin): los 5 escenarios de §5.7. _Dep: H5.4_
- H6.2 Snapshot y "Restaurar demo" + guía manual con `sqlite3` en el README. _Dep: H6.1_

**E7 — CSV, bitácora y exportación**

- H7.1 Carga CSV con validación por fila, límites y firma por lotes. _Dep: H5.3_
- H7.2 Bitácora encadenada con hash, registro de todas las acciones de §5.10 y endpoint para el auditor. _Dep: H3.2, H1.2_
- H7.3 `GET /cadena/exportar` (JSON §5.9) + descarga de `server-public.pem` y su huella. _Dep: H5.4_

**E8 — Verificador independiente**

- H8.1 CLI `verificador cadena.json --server-key server-public.pem` usando `core`. _Dep: H7.3_
- H8.2 Página web de verificación local (dos archivos, sin llamar a la API). _Dep: H7.3, H9.1_

**E9 — Interfaz funcional (sin diseño visual elaborado)**

- H9.1 React + Vite: enrutador, cliente API, login, layout por rol. _Dep: H0.1_
- H9.2 Página Personas (tabla + formulario) y página Cadena (lista de bloques). _Dep: H9.1, H2.2_
- H9.3 Página Verificar (reporte verde/rojo por chequeo). _Dep: H9.2, H2.3_
- H9.4 Páginas Admin (usuarios, aprobación de llaves, ataques, restaurar), Bitácora y subida de CSV. _Dep: H9.3 + la historia de API correspondiente_

**E10 — Diseño visual (módulo aparte)**

- H10.1 Sistema visual: paleta, tipografía, componentes base y tema (claro/oscuro opcional). _Dep: H9.1_
- H10.2 Vista de cadena como bloques conectados (hash anterior → hash, nonce, firmante, estado) y animación de minado. _Dep: H10.1, H9.3_
- H10.3 Pulir el resto de las páginas y el modo presentación para la sustentación. _Dep: H10.1, H9.4_

**E11 — Infraestructura**

- H11.1 Script `openssl` para la CA raíz y el certificado de `localhost` + instrucciones para confiar en la CA. _Dep: H0.1_
- H11.2 Dockerfiles + `docker compose` (API, web compilada, nginx TLS), volúmenes para la BD y las llaves, secretos por `.env`. _Dep: H11.1, H2.3_

**E12 — Entrega**

- H12.1 README: instalación, demo paso a paso y guía de ataques. _Dep: H6.2, H8.1_
- H12.2 Informe: diseño, justificación criptográfica, matriz de permisos, lista de codificación segura (§6), limitaciones (rollback, llave del servidor, cédula y nombre en claro) y `npm audit`. _Dep: funcionalidades congeladas_
- H12.3 Guion de sustentación (§9) y ensayo cronometrado. _Dep: H12.1_

**Qué se puede hacer en paralelo** (por si los dos trabajan el mismo día): E1 ‖ H2.1 ‖ H9.1 ‖ H11.1 desde el inicio; después E3 ‖ E4 ‖ E10; después E7 ‖ E8 ‖ H11.2.

## 9. Verificación (cómo saber que está terminado)

1. Las pruebas de `packages/core` pasan, incluidos los 5 escenarios de ataque.
2. `docker compose up` → abrir `https://localhost` (con la CA propia confiada) → login como admin.
3. Crear un registrador, que genere su llave, agregue una persona y cargue un CSV de ~10 filas → la cadena muestra los bloques con PoW y firma.
4. Verificar → todo ✅.
5. Ejecutar cada ataque → verificar → aparece ❌ en el bloque y chequeo esperados → restaurar.
6. Exportar JSON → `npx verificador cadena.json` y la página del verificador dan el mismo resultado que el servidor.
7. Revisar que la bitácora registró todo lo anterior y que su propia cadena es válida.
