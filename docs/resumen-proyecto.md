# Qué se hizo en Verichain y qué seguridad implementa

> Resumen del proyecto (Ciberseguridad, Icesi). Cubre el requisito del enunciado (proyecto 7) y lo que se agregó de más.
> Diseño completo: [`docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md`](superpowers/specs/2026-11-09-blockchain-integridad-design.md).
> Cómo probarlo todo: [`docs/guia-pruebas.md`](guia-pruebas.md).

## 1. El requisito del enunciado (lo mínimo que se pedía)

| Requisito de la rúbrica                                                                      | Cómo está resuelto                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blockchain sencilla a partir de una tabla de datos (cédula, nombre, dirección, teléfono)     | Tabla `Persona` y tabla `Bloque` (SQLite + Prisma). Un bloque por persona.                                                                                                                                         |
| Arranca con un solo bloque, el **génesis**                                                   | Se crea solo al iniciar la API si la cadena está vacía (índice 0, `hash_anterior` = 64 ceros).                                                                                                                     |
| Un bloque de datos por cada registro                                                         | Cada persona nueva anexa exactamente un bloque.                                                                                                                                                                    |
| Cada bloque lleva un **hash SHA-256 de sus datos**                                           | `hash_datos` = SHA-256 de la serialización canónica de la fila (`packages/core/src/canonico.ts`, `hash.ts`).                                                                                                       |
| Cada bloque lleva un **hash SHA-256 de todos los anteriores y el actual** ("hash de hashes") | `hash_cadena_i` = SHA-256(`hash_cadena_{i-1}` ‖ `hash_datos_i` ‖ `nonce_i`): encadena todo lo anterior.                                                                                                            |
| Poder **crear filas nuevas**                                                                 | Página **Personas** (formulario) y **carga masiva CSV**.                                                                                                                                                           |
| **Verificar la integridad calculando los hashes en vivo** y comparando con los almacenados   | `GET /api/cadena/verificar` y páginas **Verificar** / **Cadena**: recalcula todo desde los datos actuales y reporta, por bloque, qué chequeo falla y el **primer bloque roto** (`packages/core/src/verificar.ts`). |

## 2. Lo que se agregó de más

- **Prueba de trabajo (PoW):** el `hash_cadena` debe empezar con N ceros (por defecto 4); la interfaz muestra nonce, intentos y tiempo de minado.
- **Cifrado** de dirección y teléfono (AES-256-GCM) con la llave `DATA_KEY`.
- **Login con roles** (admin, registrador, auditor) y matriz de permisos.
- **Firma del usuario en cada bloque** (ECDSA P-256, hecha en su navegador): no repudio.
- **Sello digital del servidor** sobre el último bloque: detecta el truncamiento y la reescritura completa de la cadena.
- **Gestión de llaves:** el registrador genera su llave, la registra y el admin la aprueba (y se rota con aprobación).
- **Módulo de ataques (solo demo)** con 5 escenarios, **snapshot y "Restaurar demo"**.
- **Bitácora de auditoría** encadenada con hash.
- **Exportación** de la cadena y **verificadores independientes**: CLI (`tools/verificador`) y página `/verificador` que verifica en el navegador sin llamar al servidor.
- **Carga masiva CSV** con firma por lotes.
- **HTTPS con CA propia** y **Docker Compose** (nginx + API).
- **Interfaz** con sistema visual, bloques conectados, **modo presentación** para el proyector.
- Documentación: README, guion de sustentación y esta guía.

## 3. Qué hace el proyecto en ciberseguridad

Cada servicio de seguridad, qué lo implementa y dónde está.

### 3.1 Integridad

- **SHA-256** de los datos y de la cadena (`@bc/core`, con `@noble/hashes`; nada de criptografía propia).
- **Serialización canónica determinista** (orden fijo de campos, UTF-8): evita falsos positivos en la verificación.
- **Verificación en vivo** que recalcula todo (hash de datos, enlace, hash de cadena, PoW, firma del usuario) y el sello.
- **PoW** que encarece reescribir la cadena (la protección fuerte la dan las firmas).
- **Rechazo de anexos sobre una cadena alterada:** antes de escribir, el servidor verifica toda la cadena y el sello; si fallan, la cadena queda "comprometida" y no se anexa nada hasta restaurar (así un ataque no se "lava").
- **Bitácora** de auditoría con su propio encadenamiento de hashes y verificación.

### 3.2 Confidencialidad

- **AES-256-GCM** para dirección y teléfono (`apps/api/src/cripto/cifrado.service.ts`): IV aleatorio de 12 bytes y tag de autenticación; si el texto cifrado se altera, el descifrado falla y el dato se marca como corrupto (nunca un error 500).
- **El hash se calcula sobre el texto cifrado:** el verificador independiente comprueba la integridad sin ver datos personales y no se exponen hashes de datos de baja entropía.
- **Visibilidad por rol:** solo el registrador ve dirección y teléfono descifrados; auditor y admin ven `***`.
- **TLS (HTTPS)** con CA propia, TLS 1.2/1.3, HSTS (`infra/tls`, `infra/nginx/default.conf`).

### 3.3 Autenticación y control de acceso

- **argon2id** para contraseñas; política de mínimo 12 caracteres y que no sea igual al usuario.
- **JWT de vida corta** (15 min por defecto) en **cookie** `httpOnly`, `SameSite=Strict` y `Secure` en producción.
- **Límite de intentos:** login 5 por minuto por IP y 100 solicitudes por minuto en general (`@nestjs/throttler`).
- **Roles** y mínimo privilegio con guard global (`apps/api/src/auth/roles.guard.ts`, `permisos.ts`): el admin gestiona usuarios y llaves, el registrador crea registros, el auditor verifica/exporta y no ve datos personales. Separación de funciones: nadie lo hace todo.
- Sesión caducada → la interfaz vuelve al login.

### 3.4 No repudio y autenticidad

- **ECDSA P-256 en el navegador (WebCrypto):** la llave privada nunca sale del navegador sin cifrar; el respaldo va cifrado con contraseña (PBKDF2 + AES-GCM).
- **Flujo preparar → firmar → confirmar:** el servidor no puede firmar por el usuario; verifica la firma con la llave pública aprobada antes de minar y anexar.
- **Llaves versionadas y aprobadas por el admin;** las viejas no se borran, así los bloques antiguos siguen verificando.
- **Sello ECDSA del servidor** (llave en un PEM fuera de la BD, modo 600) sobre `(índice ‖ hash_cadena)` del último bloque.
- **El verificador no confía en el archivo:** la llave pública del servidor la fija quien verifica (archivo aparte); si su huella no coincide con la del JSON, advierte y usa la fijada. Sin sello = comprometida.

### 3.5 Codificación segura (OT3)

- **Validación de toda entrada** con DTO y `class-validator`; `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted` (`apps/api/src/configurar-app.ts`).
- **Sin inyección SQL:** solo Prisma con consultas parametrizadas; sin `$queryRawUnsafe` ni `$executeRawUnsafe` en el código propio.
- **Sin XSS:** React escapa la salida y no se usa `dangerouslySetInnerHTML`; `helmet` en la API y **CSP estricta** en nginx (sin estilos ni scripts en línea).
- **CORS** restringido al origen del frontend; `helmet` activo.
- **Errores genéricos** al cliente, sin trazas (`comun/filtro-excepciones.ts`); el detalle va a la bitácora y los logs, sin datos personales ni secretos.
- **Secretos** solo en `.env` y `secrets/` (ignorados por git); `.dockerignore` excluye secretos de las imágenes.
- **Comparación de firmas** con funciones de la librería (`verify`), no con `===`.
- **Subida de CSV segura:** parser real (`csv-parse`, no `split`), máximo 200 KB y 500 filas, solo `.csv`, encabezado exacto, registros acotados, sin guardar en disco; celdas como `=HYPERLINK(...)` se rechazan por la regex del nombre.
- **Docker:** contenedor sin root, API sin puertos al host, solo dependencias de producción, IP real con `trust proxy` (un salto).
- **Linter** que prohíbe `eval`, `new Function` y `any` explícito.

### 3.6 Detección de ataques (demostrable en vivo)

| Ataque                     | Qué hace                                             | Qué lo detecta                                 |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| Modificar un dato          | Cambia un nombre directo en la BD                    | `hash_datos` del bloque                        |
| Modificar un texto cifrado | Altera el ciphertext                                 | `hash_datos` y el tag de AES-GCM               |
| Reescribir la cadena       | Altera un dato y recalcula todos los hashes y el PoW | **Firma del usuario** y **sello del servidor** |
| Borrar el último bloque    | Trunca la cadena (parece válida)                     | **Sello del servidor**                         |
| Intercambiar dos bloques   | Reordena                                             | **Enlace** `hash_anterior`                     |

## 4. Limitaciones y riesgos aceptados (honestos)

- **Rollback completo de la BD** a un estado antiguo y coherente (cadena + sellos): es justo lo que hace "Restaurar demo". Mitigación futura: anclar el sello fuera del servidor.
- **Confianza en el admin** al aprobar llaves (se mitiga con la bitácora encadenada y mostrando la huella antes de aprobar).
- **Cédula y nombre en claro** (decisión consciente; dirección y teléfono sí van cifrados).
- **Un solo servidor** (sin red P2P ni consenso).
- **Borrar entradas del final de la bitácora** no se detecta solo con su encadenamiento.
- El **PoW del verificador** usa la dificultad que trae el archivo; por eso el sello es lo que no se negocia.
- Una **llave extraíble en IndexedDB** queda al alcance de un XSS (mitigado con CSP y sin `dangerouslySetInnerHTML`).
- `npm audit` reporta avisos moderados en herramientas de lint (solo desarrollo); su tratamiento va en el informe (H12.2).

## 5. Dónde está cada cosa

| Ruta                | Contenido                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `packages/core`     | Serialización canónica, SHA-256, PoW, verificación (isomórfico: Node y navegador).        |
| `apps/api`          | NestJS + Prisma + SQLite: auth, roles, cifrado, firmas, sello, ataques, bitácora, CSV.    |
| `apps/web`          | React: personas, cadena, verificación, verificador local, usuarios, llaves, ataques, etc. |
| `tools/verificador` | CLI de verificación independiente.                                                        |
| `infra`             | CA propia (`tls`) y configuración de nginx.                                               |
| `docs`              | Diseño, backlog, README, guion de sustentación y estas guías.                             |
