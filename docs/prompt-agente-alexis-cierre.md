# Prompt para el agente de Alexis: terminar el proyecto

Pega el bloque de abajo como primer mensaje de la sesión del agente (Claude Code) abierta en la raíz del repositorio.
Escrito el 13 de noviembre de 2026; el trabajo pendiente está en [`docs/plan-cierre.md`](plan-cierre.md).

```text
Eres un agente trabajando en el repo "verichain" (proyecto final de Ciberseguridad, Icesi): una blockchain simulada
con integridad verificable. Trabajas con Alexis; el otro integrante es Juan Camilo. Casi todo está hecho: 38 de 39
historias están mezcladas en main. Tu trabajo es TERMINAR lo que falta, de forma autónoma y sin preguntar por cada paso.

ANTES DE ESCRIBIR NADA (una sola vez):
1. `git switch main && git pull`, luego `npm install`.
2. Lee COMPLETOS, en este orden:
   - docs/plan-cierre.md  (qué falta, en qué orden y cómo se da por cerrado cada punto)
   - AGENTS.md  (reglas, flujo y convenciones de seguridad: son obligatorias y se evalúan)
   - docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md  (fuente de verdad)
   - docs/backlog/README.md y docs/backlog/H12.2-informe.md
   - README.md y docs/sustentacion.md (estado actual de la documentación)
3. Prepara el entorno como dice el README («Instalación en desarrollo»): .env con JWT_SECRET, DATA_KEY y
   ADMIN_PASSWORD (genéralos en local o pídeselos a Alexis), `npm run llaves:servidor -w @bc/api`, migrar, seed. Los
   secretos NUNCA van al repositorio, a un commit ni a un PR.

QUÉ HACER, EN ESTE ORDEN:
A. Retoques pequeños de plan-cierre.md §3 (puntos 1 a 4): guion (carga CSV), tablero y guía desactualizados, el <h1>
   duplicado de la cabecera y la revisión de seguridad final (grep de dangerouslySetInnerHTML, any, $queryRaw, style=, y
   que no haya secretos en git). Un PR por retoque. Corrige lo que encuentres; si algo es grande, anótalo y sigue.
B. H12.2 Informe: SOLO si la fecha de hoy es posterior al 20 de noviembre de 2026 (congelamiento). Antes de esa fecha no
   la empieces: dile a Alexis que espere y para. Sigue plan-cierre.md §1. Cada afirmación de seguridad debe apuntar a un
   archivo real o a una prueba real (ábrelos y compruébalo). Incluye la salida ACTUAL de `npm audit` y cómo se trató
   cada hallazgo. Las capturas de los 5 ataques las hace una persona: déjalas como marcadores claros y pídeselas.
C. Verificaciones que requieren una persona (plan-cierre.md §2): NO las des por hechas. Prepara lo que puedas (listas,
   comandos exactos) y al final dile a Alexis cuáles quedan para que las haga él o su compañero.

FLUJO POR CADA HISTORIA O RETOQUE (AGENTS.md; nunca push directo a main):
1. `git switch main && git pull` y crea la rama desde ahí (`h12-2-informe`, `chore-...` o `docs-...`).
2. Si es una historia: primer commit que la reclama (`estado: en-curso`, `tomada_por: Alexis`, fecha de hoy, fila del
   tablero) → `git push -u origin <rama>` → `gh pr create --draft`.
3. Pruebas primero cuando haya código; implementa solo lo pedido y respeta «Fuera de alcance».
4. `npm run check` en verde (y la «Verificación» de la historia).
5. `estado: hecha` + tablero + «Decisiones tomadas»; commit, push, `gh pr ready` y `gh pr merge --merge` (si tu entorno
   pide confirmación para mezclar, pídesela a Alexis).
6. Nota: `gh pr edit` puede fallar por la API de Projects classic; actualiza el cuerpo del PR con
   `gh api -X PATCH repos/<dueño>/<repo>/pulls/<n> -f body='...'`, y mezcla con
   `gh api -X PUT repos/<dueño>/<repo>/pulls/<n>/merge -f merge_method=merge` si hace falta.

REGLAS QUE NO SE NEGOCIAN:
- Código y mensajes de commit en español; commits convencionales (`docs: ...`, `fix(web): ...`, `chore(backlog): ...`).
- Después del 20 de noviembre SOLO bugs en el código (la documentación sí).
- Seguridad OT3: sin `dangerouslySetInnerHTML`, sin `any`, DTO con class-validator en toda entrada nueva de la API, sin
  SQL crudo, sin estilos en línea (la CSP de nginx usa `style-src 'self'`), secretos solo en `.env`/`secrets/`,
  errores genéricos al cliente, nunca datos personales ni secretos en la bitácora ni en los logs.
- No cambies formatos de hash, serialización canónica ni exportación sin actualizar el diseño.
- No desactives ni borres pruebas para que pasen. No marques `hecha` sin la verificación en verde.
- Trampas conocidas (docs/guia-alexis.md §5): una sola conexión SQLite (nada dentro de `$transaction`), `DEMO_MODE` al
  importar, firmas ECDSA no deterministas, login limitado a 5 por minuto, `@bc/core` se consume compilado.
- Para probar a mano usa BD y llaves TEMPORALES y detén los procesos al terminar (puertos 3000, 5173, 80 y 443). No uses
  `pkill -f` ni `pgrep -f` con un patrón que aparezca en tu propio comando: mata la shell.

SI NO ALCANZAS A TERMINAR: escribe «Notas de traspaso» en el archivo de la historia (qué quedó, qué falta, qué está roto,
comandos útiles), borra `tomada_por`, deja `estado: en-curso`, haz push de la rama y deja el PR en borrador.

AL FINAL (o cuando pares por un bloqueo), dime en pocas líneas: qué hiciste, qué quedó funcionando, qué decisiones
tomaste, qué falta y qué necesitas de mí o de Juan Camilo.
```
