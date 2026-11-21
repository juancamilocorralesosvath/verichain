# Guía para probar el proyecto, punto por punto

> Sirve para comprobar que todo quedó hecho y funciona. Primero lo que pide **la rúbrica** (parte A); después **lo extra**
> (partes B a H). Cada prueba dice qué hacer y **qué debe pasar**. Qué hay implementado y por qué:
> [`resumen-proyecto.md`](resumen-proyecto.md). Si algo no sale como dice aquí, anótalo (qué pantalla, qué hiciste, qué viste).

**Rúbrica (proyecto 7):** blockchain sencilla a partir de una tabla (cédula, nombre, dirección, teléfono); arranca con un
bloque génesis y recibe un bloque por cada registro; cada bloque lleva un SHA-256 de sus datos y un SHA-256 de todos los
bloques anteriores y el actual (hash de hashes); el programa permite crear filas nuevas y verificar la integridad
calculando los hashes en vivo y comparándolos con los almacenados.

## 0. Preparación

1. `git switch main && git pull && npm install`.
2. Entorno de desarrollo según el [`README.md`](../README.md) («Instalación en desarrollo»): `.env` (con
   `DEMO_MODE=true`), `npm run llaves:servidor -w @bc/api`, migrar y `npm run seed -w @bc/api`.
   - **Empieza con la base de datos limpia** (`rm -rf apps/api/data` y migra de nuevo) para ver el génesis.
3. Dos terminales: `npm run dev -w @bc/api` y `npm run dev -w @bc/web`. Abre `http://127.0.0.1:5173`.
4. Prepara los usuarios y la llave (README, «Demo paso a paso», pasos 1 a 3): admin → **Usuarios** → crea `ana`
   (registrador) y `luisa` (auditor); `ana` → **Mi llave** → generar y registrar; admin → **Llaves** → aprobar.
   Usa dos ventanas (o una privada) para tener dos sesiones a la vez.
5. En las pruebas con `curl` usa `URL=http://localhost:3000` y guarda la sesión con `-c`/`-b` (el login está limitado a
   5 por minuto: no repitas logins innecesarios).

## 1. Pruebas automáticas (2 minutos)

```bash
npm run check
```

**Esperado:** termina sin errores (código de salida 0). Hoy son 102 pruebas en `@bc/core`, 244 en `@bc/api`,
163 en `@bc/web` y 15 en `@bc/verificador`. En la salida del API aparece una traza de `PruebaController.error`: es una
prueba que provoca un error a propósito, no un fallo.

## A. Lo que pide la rúbrica

### A1. La blockchain arranca con un solo bloque (génesis)

Con la base de datos recién migrada, inicia la API y abre **Cadena** (admin, `ana` o `luisa`).

**Esperado:** exactamente **1 bloque**, el «Bloque 0 Génesis», con `hash anterior` de ceros (`00000000…`), un nonce y su
hash de cadena. Se creó solo, sin que nadie lo pidiera.

### A2. Crear filas nuevas en la tabla = un bloque por registro

Como `ana`: **Personas** → llena cédula (6 a 10 dígitos), nombre, dirección y teléfono → **Crear persona**.
Repite con 2 personas más.

**Esperado:** aparece «Minando el bloque…» y luego «Bloque N anexado: nonce …, … intentos, … ms». La persona sale en la
tabla y en **Cadena** hay **un bloque más por cada persona** (génesis + 3 = 4 bloques). Cada bloque nuevo apunta al
anterior (flecha con «hash anterior = hash de cadena del bloque N-1»).

Prueba también un dato inválido (cédula `abc`): el formulario lo rechaza con un mensaje y **no** se crea bloque.

### A3. Cada bloque tiene el hash SHA-256 de sus datos y el hash de la cadena

En **Cadena**, cada bloque muestra **Hash de datos** y **Hash de cadena** (abreviados; el tooltip muestra el completo y el
botón ⧉ lo copia). Comprueba en la base de datos:

```bash
sqlite3 apps/api/data/blockchain.db \
  "SELECT indice, hash_datos, hash_anterior, hash_cadena, nonce FROM Bloque ORDER BY indice;"
```

**Esperado:**

- 64 caracteres hexadecimales en `hash_datos` y `hash_cadena` (SHA-256).
- El `hash_anterior` de cada bloque es **idéntico** al `hash_cadena` del bloque anterior (así cada hash incluye a todos
  los anteriores: «hash de hashes»).
- `hash_cadena` empieza con ceros (prueba de trabajo, 4 por defecto).

### A4. Recalcular los hashes «en vivo» y compararlos (el requisito central)

Como `luisa` (auditor) o admin: **Verificar** → **Verificar integridad**.

**Esperado:** veredicto grande «✅ Cadena íntegra», «4 bloques revisados» y, por bloque, **5 chequeos en ✓ ok**: hash de
datos, enlace con el anterior, hash de cadena, prueba de trabajo y firma del usuario (el génesis marca «– no aplica» en la
firma; eso no es una falla). Además la sección «Sello del servidor» en ✓ ok.

Equivalente por API: `GET /api/cadena/verificar` devuelve `"valida": true`. El servidor **recalcula** todo desde los
datos actuales de la tabla; no usa valores guardados como verdad.

### A5. La verificación detecta cualquier alteración

Altera un dato **a mano**, como lo haría un atacante con acceso a la base de datos:

```bash
sqlite3 apps/api/data/blockchain.db "UPDATE Persona SET nombre='Mallory' WHERE id=1;"
```

Vuelve a **Verificar integridad**.

**Esperado:** «❌ Cadena comprometida», «Primer bloque roto: 1» (el de esa persona), con **Hash de datos** y **Hash de
cadena** en ✕ falla y un motivo en español; el bloque sale resaltado con un enlace «Ir al bloque 1». En **Cadena** →
**Verificar cadena** ese bloque se pinta de rojo. Restaura para seguir (parte E).

## B. Seguridad: autenticación y control de acceso

| #   | Qué hacer                                                                                                                 | Esperado                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| B1  | Entra a `/cadena` sin sesión                                                                                              | Te lleva al login.                                                                                                       |
| B2  | Como `luisa` (auditor) intenta `/usuarios`, `/llaves`, `/ataques` o `/personas` con formulario                            | «Sin permiso» en las páginas de admin; en Personas **no hay formulario** ni carga CSV.                                   |
| B3  | Como `ana` (registrador) intenta `/verificar`, `/bitacora`, `/exportar`                                                   | «Sin permiso». El menú de cada rol solo muestra lo suyo.                                                                 |
| B4  | Como `ana` mira la tabla de Personas; luego como `luisa`                                                                  | `ana` ve dirección y teléfono; `luisa` ve `***` (mínimo privilegio).                                                     |
| B5  | `curl -i -H 'Content-Type: application/json' -d '{"username":"ana","password":"clave-de-ana-12345"}' $URL/api/auth/login` | `Set-Cookie: sesion=…; HttpOnly; SameSite=Strict` (y `Secure` en Docker/HTTPS). Sin la cookie, `GET /api/auth/yo` → 401. |
| B6  | Haz **6 logins fallidos** seguidos al mismo usuario                                                                       | Después del 5.º: error **429** (límite de 5 por minuto). Espera un minuto.                                               |
| B7  | Como admin, crea un usuario con contraseña de menos de 12 caracteres                                                      | Error de validación; no se crea.                                                                                         |
| B8  | Como admin, desactiva a `ana` y prueba iniciar sesión con ella                                                            | No entra. Reactívala. El admin **no puede desactivarse a sí mismo** (botón deshabilitado).                               |

## C. Seguridad: confidencialidad y validación de entradas

**C1. Cifrado en la base de datos.**

```bash
sqlite3 apps/api/data/blockchain.db "SELECT cedula, nombre, direccion_cifrada, telefono_cifrado FROM Persona;"
```

**Esperado:** cédula y nombre en claro; **dirección y teléfono son texto cifrado** (base64 ilegible), distinto en cada fila
aunque el dato se repita (IV aleatorio). En la interfaz solo el registrador los ve descifrados.

**C2. Entradas rechazadas por los DTO** (con la sesión de `ana` en `ana.jar`):

```bash
# campo que no existe → 400 (forbidNonWhitelisted)
curl -s -b ana.jar -H 'Content-Type: application/json' -d '{"cedula":"1234567","nombre":"Ana","direccion":"Calle 1 # 2-3","telefono":"3001234567","rol":"admin"}' $URL/api/bloques/preparar
# nombre con inyección SQL / HTML → 400 (regex del nombre)
curl -s -b ana.jar -H 'Content-Type: application/json' -d '{"cedula":"1234568","nombre":"Robert\"); DROP TABLE Persona;--","direccion":"Calle 1 # 2-3","telefono":"3001234567"}' $URL/api/bloques/preparar
```

**Esperado:** `400` con un mensaje genérico (`{ "statusCode": 400, "mensaje": … }`), **sin trazas de pila**, y la tabla
`Persona` intacta.

**C3. XSS.** Crea una persona con dirección `<img src=x onerror=alert(1)>` (la dirección admite casi cualquier texto).
**Esperado:** en la tabla se ve **como texto literal**; no se ejecuta nada (React escapa la salida).

**C4. Errores genéricos.** `curl -s $URL/api/no-existe` y `curl -s -b ana.jar $URL/api/cadena/exportar`.
**Esperado:** `{ "statusCode": 404/403, "mensaje": … }` cortos, sin rutas de archivos ni trazas.

## D. No repudio: firma del usuario y llaves

- **D1.** Crear una persona sin tener la llave aprobada: con `ana` sin llave registrada, **Personas** muestra «No tienes una
  llave…» y **no** hay formulario. Con la llave `pendiente`: «Tu llave está pendiente de aprobación».
- **D2.** Firma falsa por API: prepara un borrador y confírmalo con una firma de otra llave →
  `POST /api/bloques/confirmar` con `firma_b64` inválida responde **400 «Firma inválida»** y **no** anexa bloque.
- **D3.** Admin → **Llaves**: la llave pendiente muestra la **huella SHA-256** (igual a la de «Mi llave» del usuario).
  **Rechazar** una llave → ese usuario no puede firmar con ella.
- **D4.** **Mi llave** → **Descargar respaldo** (contraseña de 12+ caracteres) → borra la llave del navegador (otra ventana
  o limpiar datos del sitio) → **Importar respaldo**: vuelve la misma llave (misma huella). Con contraseña incorrecta:
  error, no se importa.

## E. Detección de ataques y restauración (la parte vistosa)

Como admin con `DEMO_MODE=true`: **Ataques** → **Tomar snapshot** («Snapshot guardado (N bloques)»). Para cada uno:
elige el **índice del bloque** (≥ 1), **Ejecutar ataque**, **Verificar ahora**, mira el resultado y **Restaurar demo**
(pide confirmación; debe volver a «✅ Cadena íntegra»).

| Ataque                            | Esperado en «Verificar ahora»                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Modificar un dato                 | ❌ en ese bloque: **Hash de datos** (y Hash de cadena) en falla.                          |
| Modificar un texto cifrado        | ❌: Hash de datos en falla (y el dato sale como «Dato corrupto» en Personas).             |
| Alterar un dato y recalcular todo | Los hashes **cuadran**, pero fallan **Firma del usuario** y **Sello del servidor**: ❌.   |
| Borrar el último bloque           | Ningún bloque en falla, pero el **sello** falla: ❌ «Cadena comprometida» (truncamiento). |
| Intercambiar dos bloques          | ❌ por **Enlace** con el anterior; en **Cadena** la conexión se resalta en rojo.          |

**Extra:** tras un ataque, intenta crear una persona: la API **se niega** («Cadena comprometida: restaure antes de
continuar») hasta que se restaure. Sin `DEMO_MODE=true` la página Ataques solo avisa que el modo demo no está activo y
`GET /api/ataques` da 404.

## F. Verificación independiente (sin confiar en el servidor)

1. Admin o auditor → **Exportar** → **Descargar la cadena (JSON)** (guarda `cadena-AAAAMMDD-HHmm.json`) y
   **Descargar server-public.pem**. Compara la huella que muestra la página con la del archivo.
2. **CLI:** `npm run build` y luego
   ```bash
   npx verificador cadena-AAAAMMDD-HHmm.json --server-key server-public.pem
   ```
   **Esperado:** informe legible, «cadena íntegra», código de salida 0 (`echo $?`).
3. **Página pública** `/verificador` (sin iniciar sesión): sube los dos archivos → **Verificar localmente**.
   **Esperado:** el mismo veredicto que el servidor y el CLI, **sin llamar a la red** (en las herramientas del navegador
   no aparece ninguna petición al verificar).
4. **Detecta alteraciones:** edita el JSON (cambia un `hash_datos` o borra el último bloque) y repite → ❌ con el bloque
   roto. Fixtures listos: `tools/verificador/test/fixtures/cadena-alterada.json` (primer bloque roto: 2).
5. **Llave del servidor equivocada:** usa `tools/verificador/test/fixtures/otra-llave-public.pem` → **advertencia de huella
   distinta** y el sello falla (siempre manda la llave que fijas tú, no la del archivo).

## G. Bitácora y carga masiva CSV

- **G1. Bitácora** (admin o auditor): **Bitácora** lista login, login fallido, preparar/crear bloque, verificar, exportar,
  ataque, restaurar… con usuario, IP y resultado, y arriba «✅ Bitácora íntegra». **Esperado:** no hay contraseñas, llaves
  ni datos personales en el detalle. Altera una entrada a mano (`UPDATE Bitacora SET accion='x' WHERE id=2;`) →
  «❌ Bitácora alterada … en la entrada N» (restaura con la demo o recrea la base).
- **G2. CSV:** como `ana`: **Personas** → «Carga masiva (CSV)» → `docs/ejemplos/personas.csv` → **Subir y validar**.
  **Esperado:** «10 válidas y 2 inválidas» (la fila con cédula `12ab` y la del nombre `=HYPERLINK(...)`, con su motivo) →
  **Firmar y anexar 10** → «Se anexaron 10 de 10 bloques»; la cadena sigue íntegra. Prueba también un CSV con
  encabezado distinto, un archivo `.txt` y uno de más de 200 KB: se rechazan con mensaje claro.

## H. HTTPS con CA propia y Docker

```bash
bash infra/tls/generar-ca.sh                       # (solo la primera vez)
docker compose up --build -d
docker compose exec api node dist/auth/ejecutar-seed.js
curl --cacert secrets/tls/ca.crt https://localhost/api/salud
curl -I http://localhost                           # 301 a https
```

**Esperado:** `https://localhost` carga **sin advertencia** si la CA está confiada (`infra/tls/README.md`); `http://`
redirige a `https://` (301); la salud responde `{"ok":true,…}`; la cookie de sesión lleva `Secure`; la API **no** está
accesible por el puerto 3000 desde el host; `docker compose exec api id -u` ≠ 0. Al terminar:
`docker compose down -v` (borra la BD).

## I. Lista de comprobación final

| #   | Comprobación                                                                                 | ✔   |
| --- | -------------------------------------------------------------------------------------------- | --- |
| 1   | `npm run check` en verde en `main` limpio y sincronizado                                     |     |
| 2   | Arranca con un solo bloque (génesis) (A1)                                                    |     |
| 3   | Crear filas nuevas agrega un bloque por registro (A2)                                        |     |
| 4   | Cada bloque tiene su `hash_datos` y su `hash_cadena`, encadenados (A3)                       |     |
| 5   | Verificar recalcula en vivo y da ✅ en una cadena sana (A4)                                  |     |
| 6   | Alterar un dato en la BD se detecta con el bloque y el chequeo correctos (A5)                |     |
| 7   | Roles: cada rol ve solo lo suyo; el auditor no ve datos personales (B2–B4)                   |     |
| 8   | Cookie `HttpOnly` + `SameSite=Strict`; login limitado a 5 por minuto (B5–B6)                 |     |
| 9   | Dirección y teléfono cifrados en la BD (C1)                                                  |     |
| 10  | Entradas inválidas rechazadas con errores genéricos; sin XSS ni SQL injection (C2–C4)        |     |
| 11  | Firma inválida rechazada; llaves aprobadas por el admin (D2–D3)                              |     |
| 12  | Los 5 ataques se detectan en el bloque y chequeo esperados y «Restaurar demo» recupera (E)   |     |
| 13  | CLI y `/verificador` dan el mismo resultado que el servidor; detectan la cadena alterada (F) |     |
| 14  | Bitácora registra todo y su cadena es válida; CSV de ejemplo: 10 válidas y 2 inválidas (G)   |     |
| 15  | `docker compose up` → `https://localhost` sin advertencia, login y flujo completo (H)        |     |
