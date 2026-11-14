# Plan de cierre del proyecto

> Escrito el 13 de noviembre de 2026. **Estado:** 38 de 39 historias hechas y mezcladas en `main` (`npm run check` en
> verde). Falta la H12.2 (informe) y una lista corta de verificaciones humanas y retoques. Fechas: **congelamiento el
> viernes 20 de noviembre** (desde ahí solo bugs), documentación el 21, ensayo el 22, entrega asumida el 23.

## 1. H12.2 — Informe final (después del 20 de noviembre)

Historia: [`docs/backlog/H12.2-informe.md`](backlog/H12.2-informe.md). Va en `docs/informe/` (o el formato que pida el
profesor; confírmalo antes de empezar). Orden sugerido de trabajo:

1. **Confirmar el formato y la extensión** que pide el profesor (Markdown/PDF/Word, número de páginas, plantilla).
2. **Problema y arquitectura:** enunciado (proyecto 7), diagrama de componentes (web, nginx, API, SQLite, `@bc/core`,
   CLI) y el flujo preparar → firmar → confirmar (diseño §5.3). Usa capturas de la interfaz.
3. **Justificación criptográfica** (diseño §5): SHA-256 (resistencia a colisiones), AES-256-GCM (confidencialidad +
   autenticación), ECDSA P-256 (no repudio y sello), argon2id, PoW (por qué encarece pero la protección fuerte son las
   firmas) y la CA propia (`infra/tls`).
4. **Matriz de permisos** (diseño §7b) con su razón: mínimo privilegio y separación de funciones. Verifica que coincide
   con `apps/api/src/auth/permisos.ts` y con el menú de `apps/web/src/App.tsx`.
5. **Lista de codificación segura** (diseño §6): cada punto con el **archivo exacto** donde se aplica y la prueba que lo
   cubre (por ejemplo `configurar-app.ts`, los DTO con `class-validator`, Prisma sin SQL crudo, `helmet` + CSP en
   `infra/nginx/default.conf`, `TRUST_PROXY`, errores genéricos en `comun/filtro-excepciones.ts`).
6. **Resultados de los 5 ataques:** tabla ataque → qué lo detecta, **con capturas** (hay que ejecutarlos: página
   Ataques → _Ejecutar ataque_ → _Verificar ahora_).
7. **Limitaciones y riesgos aceptados** (ya conocidos): rollback completo de la BD (es lo que hace «Restaurar demo»),
   confianza en el admin al aprobar llaves, cédula y nombre en claro, un solo servidor, borrar entradas del **final** de la
   bitácora no se detecta con el encadenamiento solo, el PoW del verificador usa la dificultad del archivo (la protección
   fuerte es el sello), una llave extraíble en IndexedDB queda al alcance de un XSS (mitigado con CSP y sin
   `dangerouslySetInnerHTML`).
8. **`npm audit`:** pegar la salida **actual** (el 13/11 había avisos moderados, p. ej. `minimatch` en herramientas de
   lint, solo desarrollo) y decir cómo se trató cada hallazgo. No uses `npm audit fix --force` sin probar todo.
9. **Consideraciones éticas (OT4):** datos personales de terceros y uso responsable del módulo de ataques.
10. **Criterios de aceptación:** cada afirmación de seguridad apunta a código o a una prueba existente, e incluye el
    `npm audit` actual. Antes de escribir una afirmación, abre el archivo y compruébala.

## 2. Verificaciones que requieren una persona (no se pueden dar por hechas)

| #   | Qué                                                                                                                                                             | Historia   | Cómo se da por cerrado                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| 1   | **Alguien que no tocó el proyecto levanta todo siguiendo solo el `README.md`** (desarrollo y Docker).                                                           | H12.1      | Anotar quién lo probó y la fecha en «Decisiones tomadas» de `H12.1-readme.md`; corregir lo que falle. |
| 2   | **Ensayo cronometrado completo** de `docs/sustentacion.md` (dos veces) con los dos integrantes.                                                                 | H12.3      | Llenar la tabla «Registro de ensayos» y marcar el criterio en `H12.3-guion-sustentacion.md`.          |
| 3   | **Revisar el modo presentación en el proyector real** (1280×720): legibilidad, que nada se corte, el `Modo presentación` activado.                              | H10.3      | Anotar el resultado en «Decisiones tomadas» de `H10.3-pulido-y-modo-presentacion.md`.                 |
| 4   | **Docker en el equipo del proyector:** `docker compose up --build`, CA confiada, `https://localhost` sin advertencia, login y flujo completo.                   | H11.2      | Anotar en `H11.2-docker-compose.md`. Si falla, usar el plan B del guion (modo desarrollo).            |
| 5   | **Flujo completo en el navegador real** (no solo con scripts): _Mi llave_ (generar y registrar en el navegador) → aprobar → crear persona por formulario → CSV. | H5.x, H7.1 | Anotar en «Notas» de H7.1. Hasta ahora la firma de `ana` en las pruebas manuales se hizo por script.  |

## 3. Retoques y deuda pequeña (en este orden; cada uno cabe en un PR chico)

1. [x] **Guion de sustentación:** añadir al bloque 3 la carga del CSV de ejemplo (`docs/ejemplos/personas.csv`) si hay
       tiempo (nota al final de `docs/sustentacion.md`). _(Completado en PR #36)_.
2. [x] **Tablero (`docs/backlog/README.md`):** la sección «Reparto» y «Disponibles ahora» quedaron desactualizadas; deja
       solo H12.2 como pendiente y limpia el resto. Actualiza también `docs/guia-alexis.md` (su §1 dice «27 hechas»). _(Completado en PR #37)_.
3. [x] **Accesibilidad:** la cabecera usa un `<h1>` («Verichain») y cada página otro `<h1>`; pasa el de la cabecera a un
       elemento no encabezado (cuidando las pruebas por rol) — anotado como pendiente menor en H10.3. _(Completado en PR #38 con `span.marca`)_.
4. [x] **Revisión de seguridad final** (antes del congelamiento): `grep` de `dangerouslySetInnerHTML`, `any`, `$queryRaw` y
       `style=` en `apps/`; confirmar que `.env`, `secrets/` y `*.pem` no están en git (`git ls-files | grep -E "\.env$|secrets|\.pem"`
       solo debe devolver los fixtures de prueba); revisar que la bitácora no guarda datos personales. _(Verificado: 0 incidencias; fixtures limpios; timeout de API robustecido)_.
5. **Entrega:** `git switch main && git pull`, `npm run check`, `docker compose up --build` desde cero y la lista de
   comprobación de `docs/guia-alexis.md` §9 (diseño §9, pasos 1–7).

## 4. Lista de comprobación final (diseño §9)

1. `npm run check` en verde en `main` limpio y sincronizado.
2. `docker compose up` → `https://localhost` con la CA confiada → login como admin.
3. Crear un registrador, que genere su llave, el admin la apruebe, agregar una persona y cargar el CSV de ejemplo.
4. Verificar → todo ✅.
5. Ejecutar cada ataque → verificar → ❌ en el bloque y el chequeo esperados → restaurar.
6. Exportar → `npx verificador cadena.json --server-key server-public.pem` y la página `/verificador` dan el mismo
   resultado que el servidor.
7. La bitácora registró todo lo anterior y su propia cadena es válida.

## 5. Reglas que siguen vigentes

`AGENTS.md` manda: una rama y un PR por historia o retoque, nunca push directo a `main`, pruebas primero, mensajes de
commit en español y convencionales, seguridad OT3 (sin `dangerouslySetInnerHTML`, sin `any`, DTO en toda entrada, sin SQL
crudo, secretos solo en `.env` y `secrets/`, errores genéricos). Después del 20 de noviembre **solo bugs** en el código.
