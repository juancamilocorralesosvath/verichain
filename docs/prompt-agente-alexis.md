# Prompt para el agente de Alexis

Pega el bloque de abajo como primer mensaje de la sesión del agente (Claude Code) abierta en la raíz del repositorio.
Se actualizó el 12 de noviembre de 2026; si más adelante cambian las reglas, cambia también `AGENTS.md` y esta guía.

```text
Eres un agente trabajando en el repo "verichain" (proyecto final de Ciberseguridad, Icesi): una blockchain simulada con
integridad verificable. Mi nombre es Alexis. Trabajo con Juan Camilo; él y su agente ya terminaron sus seis historias y
me dejaron las mías. Quiero que las hagas TODAS, en orden, de forma autónoma, sin preguntarme por cada paso.

ANTES DE ESCRIBIR CÓDIGO (una sola vez):
1. `git switch main && git pull`, luego `npm install`.
2. Lee COMPLETOS, en este orden:
   - docs/guia-alexis.md  (estado del proyecto, cómo levantar el entorno, mapa de la API, piezas reutilizables,
     trampas ya encontradas y el plan de trabajo con tus seis historias)
   - AGENTS.md  (reglas, flujo y convenciones de seguridad: son obligatorias y se evalúan)
   - docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md  (fuente de verdad)
   - docs/backlog/README.md  (tablero)
3. Prepara el entorno como dice la sección 2 de la guía (.env con JWT_SECRET, DATA_KEY y ADMIN_PASSWORD que yo te dé o
   que generes en local; `npm run llaves:servidor -w @bc/api`; migrar; seed). Los secretos NUNCA van al repositorio, a un
   commit ni a un PR. Si necesitas que yo ponga un valor, pídemelo y sigue con lo que no dependa de él.

MIS SEIS HISTORIAS, EN ESTE ORDEN (cada una depende solo de cosas que ya están hechas):
  1. H9.3  Página Verificar y el componente <ReporteVerificacion>
  2. H7.1  Carga masiva CSV con firma por lotes (API + web)
  3. H8.2  Verificador web local, sin servidor
  4. H9.4  Páginas de admin, llaves, ataques, bitácora, CSV y exportar
  5. H11.2 Docker Compose con nginx y TLS
  6. H10.1 Sistema visual (solo marcado y estilos)
Después de las seis, sigue con el cierre del proyecto en este orden (sección 8 de la guía): H10.2, H10.3, H12.1, H12.3 y,
cuando pase el congelamiento del 20 de noviembre, H12.2. Si Juan Camilo ya tomó alguna, en el tablero tendrá
`en-curso` con dueño: no la toques y pasa a la siguiente.

FLUJO POR CADA HISTORIA (AGENTS.md y la sección 6 de la guía lo detallan; nunca hagas push directo a main):
1. `git switch main && git pull` y crea la rama `h<épica>-<n>-<slug>` desde ahí.
2. Haz el PLAN de la historia (breve: qué APIs ya existen, qué falta, qué pruebas, qué riesgos) y síguelo.
3. Primer commit: reclámala (`estado: en-curso`, `tomada_por: Alexis`, fecha de hoy, fila del tablero) →
   `git push -u origin <rama>` → `gh pr create --draft`.
4. Escribe PRIMERO las pruebas de los criterios de aceptación, míralas fallar y luego implementa. Implementa SOLO lo que
   pide la historia y respeta su "Fuera de alcance". Lo que la historia marca como especificación no se cambia; si algo no
   está definido, toma la opción más simple que respete el diseño y anótala en "Decisiones tomadas".
5. Corre la sección "Verificación" de la historia y `npm run check`: todo en verde. Si la historia pide verlo funcionando,
   pruébalo a mano con la API y la web reales (BD y llaves temporales) y detén los procesos al terminar.
6. En la misma rama: `estado: hecha`, tablero ("Disponibles ahora") y las "Decisiones tomadas" en el archivo de la
   historia; commit, push, `gh pr ready` y `gh pr merge --merge`. Si tu entorno te pide mi confirmación para mezclar,
   pídemela y espera.
7. `git switch main && git pull` y empieza la siguiente. No me preguntes por elegir la historia, por el plan ni por
   cada paso: solo para si hay un bloqueo real que no se resuelva con la opción más simple del diseño, o si necesitas un
   secreto o una decisión mía.

REGLAS QUE NO SE NEGOCIAN:
- Código y mensajes de commit en español; commits convencionales (`feat(web): …`, `test(api): …`, `chore(backlog): …`).
- Seguridad (OT3): sin `dangerouslySetInnerHTML`, sin `any`, DTO con class-validator en toda entrada nueva de la API,
  sin SQL crudo, secretos solo en `.env`/`secrets/`, errores genéricos al cliente, nunca datos personales ni secretos en la
  bitácora ni en los logs. No cambies formatos de hash, serialización canónica ni de exportación sin actualizar el diseño.
- No desactives ni borres pruebas para que pasen. No marques `hecha` sin la verificación en verde.
- Respeta las trampas de la sección 5 de la guía (una sola conexión SQLite, `DEMO_MODE` al importar, firmas ECDSA no
  deterministas, límite de 5 logins por minuto, `@bc/core` se consume compilado).

SI NO ALCANZAS A TERMINAR UNA HISTORIA: escribe "Notas de traspaso" en su archivo (qué quedó, qué falta, qué está roto,
comandos útiles), borra `tomada_por`, deja `estado: en-curso`, haz push de la rama y deja el PR en borrador.

AL FINAL (o cuando pares por un bloqueo), dime en pocas líneas: qué historias hiciste, qué quedó funcionando, qué decisiones
tomaste, qué historias quedan pendientes y qué necesitas de mí.
```
