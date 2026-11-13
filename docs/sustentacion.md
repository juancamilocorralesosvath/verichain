# Guion de sustentación

> Basado en el diseño §9 (verificación) y en el estado real de la aplicación. Quien habla: **JC** = Juan Camilo,
> **AL** = Alexis. El tiempo total supone **15 minutos** de exposición + preguntas; si el profesor da otro tiempo, recorta
> el bloque 6 (verificador independiente) y el 5 (bitácora) y deja los ataques, que son lo central.

## 1. Checklist previa (la tarde anterior y 30 minutos antes)

- [ ] `main` sincronizado y `npm run check` en verde.
- [ ] **Docker:** `docker compose down -v` y luego `docker compose up --build -d` con `.env` completo
      (`JWT_SECRET`, `DATA_KEY`, `ADMIN_PASSWORD`) y **`DEMO_MODE=true`**. Seed del admin:
      `docker compose exec api node dist/auth/ejecutar-seed.js`. Prueba: `curl --cacert secrets/tls/ca.crt https://localhost/api/salud`.
- [ ] **CA confiada en el equipo del proyector** (`secrets/tls/ca.crt`, ver `infra/tls/README.md`) y el navegador
      reiniciado: `https://localhost` carga **sin advertencia** (candado cerrado). Lleva la CA en una memoria USB.
- [ ] **BD limpia y preparada** (desde la interfaz, README «Demo paso a paso», pasos 1–3): usuarios `ana` (registrador) y `luisa` (auditor) creados;
      **llave de `ana` generada en el navegador del proyector, registrada y aprobada** (o **importada** desde su
      respaldo: _Mi llave_ → _Importar un respaldo_; guarda el respaldo cifrado y su contraseña a mano).
- [ ] Al menos **3 personas** ya anexadas con `ana` (para que haya bloques que atacar) y **snapshot tomado**
      (página **Ataques** → _Tomar snapshot_) con los usuarios y la llave ya aprobada. Después de cada ataque se restaura a ese estado.
- [ ] Sesiones abiertas en pestañas separadas: admin, `ana` y `luisa` (el login limita a 5 intentos por minuto por IP;
      no reinicies sesiones en vivo). Abre `https://localhost/verificador` en otra pestaña.
- [ ] Una terminal con el CLI listo: `npm run build` hecho y `server-public.pem` junto al directorio de trabajo.
- [ ] Un `cadena.json` de reserva ya exportado por si falla la descarga, y capturas de pantalla de cada ataque (plan B).
- [ ] Zoom del navegador al 125 % (proyector) y notificaciones silenciadas.

## 2. Guion cronometrado

| Min         | Quién   | Qué se dice y se hace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–1:30   | JC      | **Qué es y qué pide el enunciado.** Tabla de personas → un bloque por registro con `SHA-256(datos)` y hash acumulado. «Además lo hicimos _demostrable_: atacamos la base de datos en vivo y el sistema dice qué se rompió.» Un solo servidor, cadena _append-only_.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1:30–3:30   | AL      | **Arquitectura y servicios de seguridad** (una diapositiva o el README): integridad (SHA-256 + PoW), confidencialidad (AES-256-GCM en dirección y teléfono), autenticación y roles (argon2id, JWT en cookie `httpOnly`), no repudio (ECDSA P-256 firmada en el navegador), sello ECDSA del servidor, CA propia y HTTPS.                                                                                                                                                                                                                                                                                                                                                                                     |
| 3:30–5:30   | AL      | **Crear un registro (como `ana`).** _Personas_ → formulario → _Crear persona_. Explica los tres pasos: el servidor valida y cifra → el **navegador firma** el hash con la llave privada que nunca sale de él → el servidor verifica la firma, **mina** (nonce y tiempo en pantalla) y anexa. Ve a _Cadena_: el bloque nuevo conectado al anterior. Opcional si hay tiempo: _Cargar CSV_ con `docs/ejemplos/personas.csv` (muestra 10 válidas y 2 inválidas) → _Firmar y anexar 10_ por lotes.                                                                                                                                                                                                               |
| 5:30–6:30   | JC      | **Verificar (como `luisa`).** _Verificar_ → ✅ íntegra: los 5 chequeos por bloque (hash de datos, enlace, hash de cadena, PoW, firma del usuario) y el sello del servidor. «Recalcula todo en vivo.»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6:30–11:00  | JC y AL | **Ataques** (4 min de ataque + restauraciones; JC ejecuta, AL explica). Para cada uno: ejecutar, _Verificar_, mostrar el ❌ y el chequeo que lo detecta, y **restaurar** (`POST /api/demo/restaurar`). Orden: **1)** `modificar-dato` → falla `hash_datos`; **2)** `reescribir-cadena` (recalcula hashes y PoW) → los hashes cuadran pero fallan **firma del usuario** y **sello**: es el ataque que muestra para qué sirven las firmas; **3)** `truncar` → la cadena «parece» válida, falla el **sello**; **4)** si hay tiempo, `reordenar` (enlace) y `modificar-cifrado` (tag GCM). Se ejecutan en la página **Ataques** (índice del bloque + _Ejecutar ataque_ + _Verificar ahora_ + _Restaurar demo_). |
| 11:00–12:30 | AL      | **Verificar sin confiar en el servidor.** Página **Exportar** (descarga `cadena.json` y `server-public.pem`; muestra la huella) → `npx verificador cadena.json --server-key server-public.pem` (mismo veredicto) y la página pública `/verificador` (sin llamar al servidor; muestra la huella de la llave fijada). «No hace falta confiar en el servidor.»                                                                                                                                                                                                                                                                                                                                                 |
| 12:30–13:30 | JC      | **Bitácora y HTTPS.** Página **Bitácora**: todo lo hecho quedó registrado y su propia cadena de hashes es válida. Candado del navegador: certificado emitido por nuestra CA.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13:30–15:00 | JC y AL | **Cierre y limitaciones honestas** (ver preguntas abajo): rollback de la BD, confianza en el admin al aprobar llaves, cédula y nombre en claro, un solo servidor. Preguntas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Ensayo: cronometra el guion completo **dos veces** y anota abajo el tiempo real; ajusta el bloque de ataques (es el que más
se alarga) antes de la sustentación.

## 3. Preguntas probables y respuesta corta

- **¿Qué pasa si el atacante recalcula todos los hashes (y el PoW)?** Los hashes cuadrarían, pero no puede falsificar
  la **firma del usuario** (la llave privada está solo en su navegador) ni el **sello del servidor** (su llave privada
  está fuera de la BD). Es el ataque `reescribir-cadena`: los hashes salen bien y fallan las firmas.
- **¿Por qué hashear el texto cifrado (ciphertext) y no el dato en claro?** Para que el verificador independiente
  compruebe integridad **sin ver datos personales**, y para no exponer hashes de datos de baja entropía (un teléfono se
  adivinaría por fuerza bruta a partir de su hash).
- **¿Qué no detecta su sistema?** Un rollback **completo** de la BD a un estado antiguo coherente (cadena + sellos
  antiguos): es lo que hace «Restaurar demo» y es un riesgo aceptado; la mitigación futura sería anclar el sello afuera.
  Tampoco protege contra un admin malicioso que apruebe una llave falsa (se mitiga con la bitácora encadenada), ni oculta
  cédula y nombre (van en claro, decisión consciente). Borrar entradas del **final** de la bitácora no se detecta solo
  con su encadenamiento.
- **¿Para qué sirve el PoW si hay un solo servidor?** Encarece reescribir la cadena, pero la protección fuerte la dan
  las firmas. El verificador usa la dificultad que trae el archivo; por eso el sello es lo que no se puede negociar.
- **¿Por qué firmar en el navegador?** El servidor **no puede** firmar en nombre del usuario: el usuario no puede negar que
  creó el registro (no repudio). La llave privada se guarda en IndexedDB y se respalda cifrada (PBKDF2 + AES-GCM).
- **¿Qué pasa si se pierde la llave privada?** Se genera otra o se importa el respaldo; registrar una llave nueva
  **requiere aprobación del admin**. Las llaves viejas no se borran: los bloques antiguos siguen verificando.
- **¿Qué evita que un atacante «lave» la cadena anexando bloques después de alterarla?** Antes de cada anexo el servidor
  verifica toda la cadena y el sello; si fallan, **rechaza escribir** y queda «cadena comprometida» hasta restaurar.
- **¿Cómo evitan la inyección SQL, XSS y demás?** `ValidationPipe` con lista blanca, Prisma con consultas
  parametrizadas, React escapa la salida y no usamos `dangerouslySetInnerHTML`, `helmet` + CSP en nginx, CORS
  restringido, límite de intentos y errores genéricos al cliente.
- **¿Qué dificultad de PoW usaron y por qué?** 4 ceros hexadecimales: minar tarda de decenas a pocos cientos de
  milisegundos (medido), así la demo es ágil. Con 5 puede tardar varios segundos (hasta ~30 s en una prueba): sirve para
  _mostrar_ el «minando…», pero es riesgoso en vivo.

## 4. Plan B

- **Docker no levanta** (puertos 80/443 ocupados, problema de imagen, sin red): usar **modo desarrollo** (README,
  «Instalación en desarrollo»): `npm run dev -w @bc/api` y `npm run dev -w @bc/web`, en `http://127.0.0.1:5173`, con el
  mismo `.env`. Sin HTTPS: se explica el candado con capturas de pantalla o `openssl s_client` (en `infra/tls/README.md`).
- **El navegador del proyector no tiene la llave de `ana`:** importar el respaldo cifrado (_Mi llave_ → _Importar_).
- **Falla la descarga o el CLI:** usar el `cadena.json` de reserva y la página `/verificador` (no depende del servidor).
- **El login se bloquea (5 por minuto):** esperar un minuto; por eso las sesiones se abren de antemano.
- **Algo se rompe a media demo:** _Restaurar demo_ devuelve a la BD preparada (con usuarios y llave ya aprobada).
- **Falla todo en vivo:** mostrar las capturas guardadas de cada ataque y del ✅/❌ de _Verificar_.

## 5. Registro de ensayos

| Fecha | Ensayo | Tiempo total | Observaciones |
| ----- | ------ | ------------ | ------------- |
|       | 1      |              |               |
|       | 2      |              |               |
