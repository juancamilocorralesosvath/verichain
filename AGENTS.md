# AGENTS.md — Reglas para agentes de IA (y humanos)

Proyecto final de Ciberseguridad (Icesi): **simulación de blockchain con integridad verificable**.
Equipo: Juan Camilo y Alexis. No hay tareas fijas: cada sesión toma historias del backlog.

## Antes de escribir código (obligatorio)

1. Lee el diseño: `docs/superpowers/specs/2026-11-09-blockchain-integridad-design.md`. Es la fuente de verdad.
2. Lee el tablero: `docs/backlog/README.md`.
3. Lee **completa** la historia que vas a hacer: `docs/backlog/<id>-*.md`, incluidas las "Notas de traspaso" si las tiene.

## Flujo de trabajo

> **Nunca se trabaja ni se hace push directo a `main`.** Cada historia = una rama = un Pull Request. `main` solo recibe cambios mezclando un PR.

1. `git switch main && git pull`: parte siempre de `main` actualizado.
2. Elige una historia con `estado: pendiente` cuyas dependencias (`depende_de`) estén todas en `hecha`.
   - Si una historia está `en-curso` **sin** `tomada_por`, quedó a medias: puedes retomarla desde su rama (y su PR en borrador) y sus notas.
   - Si está `en-curso` **con** dueño, no la toques.
3. Crea la rama **desde `main`**: `git switch -c h<epica>-<n>-<slug>`, por ejemplo `h1-3-pow`.
4. **Reclámala en el primer commit de la rama:** pon `estado: en-curso`, `tomada_por: <nombre>` y `fecha: AAAA-MM-DD`, actualiza la fila del tablero y haz commit (`chore(backlog): tomar H1.3`). Luego `git push -u origin <rama>` y abre un **PR en borrador** (`gh pr create --draft`): así el otro ve que la historia está tomada.
5. Implementa **solo** lo que dice la historia (pruebas primero). Respeta "Fuera de alcance".
6. Corre la sección "Verificación" de la historia **y** `npm run check`. Todo en verde.
7. En la misma rama, pon `estado: hecha` y actualiza el tablero (commit), haz push, marca el PR como listo (`gh pr ready`) y mézclalo con `gh pr merge --merge`. Título del PR: `feat(core): ... (H1.3)`; cuerpo con resumen y verificación. **`main` siempre debe funcionar.**
8. **Si no terminas:** escribe "Notas de traspaso" en el archivo de la historia (qué quedó, qué falta, qué se rompió, comandos útiles), borra `tomada_por`, deja `estado: en-curso` y haz push de la rama; el PR queda en borrador.

## Reglas para el agente

- Si una decisión no está en el diseño ni en la historia, toma **la opción más simple** que respete el diseño y anótala en "Notas de traspaso" (sección "Decisiones tomadas").
- No modifiques archivos que pertenecen a otra historia sin anotarlo en tus notas.
- No marques `hecha` sin la verificación en verde. No desactives pruebas para que pasen.
- No cambies el formato de hash, la serialización canónica ni el formato de exportación sin actualizar el diseño: rompería la verificación de cadenas existentes.
- Mensajes de commit en español, estilo convencional: `feat(core): ...`, `fix(api): ...`, `test(core): ...`, `chore(backlog): ...`.

## Stack y estructura

| Ruta                         | Qué es                                                                                                         | Herramientas            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `packages/core` (`@bc/core`) | Lógica pura compartida: serialización canónica, SHA-256, PoW, verificación. **Isomórfica** (Node y navegador). | TypeScript ESM, Vitest  |
| `apps/api`                   | Servicio NestJS (integridad, auth, cifrado, firmas).                                                           | NestJS, Prisma, SQLite  |
| `apps/web`                   | Interfaz React.                                                                                                | React, Vite, TypeScript |
| `tools/verificador`          | CLI que verifica un JSON exportado.                                                                            | Node + `@bc/core`       |

- Node >= 22.12. **TypeScript fijado en `~6.0`** (typescript-eslint aún no soporta TS 7).
- Workspaces de npm: instala con `npm install -w <paquete> <dep>`.
- `@bc/core` se compila a `dist/` (`npm run build -w @bc/core`). Las apps lo consumen ya compilado.

## Comandos

```bash
npm install           # instala todo
npm run check         # formato + lint + tipos + pruebas (usar antes de marcar hecha)
npm run test          # pruebas de todos los workspaces
npm run build         # compila todos los workspaces
npm run format        # aplica Prettier
```

## Convenciones de seguridad (OT3 — se evalúan)

- **Criptografía:** solo librerías probadas, nunca algoritmos propios.
  - En `packages/core`: SHA-256 con `@noble/hashes` (síncrono e isomórfico). Prohibido importar `node:*` en `core`.
  - En la API: módulo `crypto` de Node (AES-256-GCM, ECDSA P-256).
  - En la web: WebCrypto (`crypto.subtle`).
- **Entradas:** toda entrada de la API pasa por un DTO con `class-validator`. `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`.
- **BD:** solo Prisma con consultas parametrizadas. Prohibido `$queryRawUnsafe` y `$executeRawUnsafe`, salvo dentro del módulo de ataques (H6.1), y ahí sin interpolar entrada del usuario.
- **Salida:** React escapa por defecto. Prohibido `dangerouslySetInnerHTML`.
- **Errores:** al cliente, mensajes genéricos sin traza de pila. El detalle va a los logs o la bitácora.
- **Secretos:** solo en `.env` y `secrets/` (ignorados por git). Documenta cada variable nueva en `.env.example`.
- **Comparaciones** de hashes y firmas con funciones de la librería (`timingSafeEqual` / `verify`), no con `===` sobre secretos.
- ESLint prohíbe `eval`, `new Function` y `any` explícito.

## Glosario rápido

- `hash_datos` = SHA-256 de la serialización canónica de la fila (con dirección y teléfono **cifrados**).
- `hash_cadena_i` = SHA-256(`hash_cadena_{i-1}` ‖ `hash_datos_i` ‖ `nonce_i`), con N ceros iniciales (PoW).
- **Sello** = firma ECDSA del servidor sobre (`indice_ultimo` ‖ `hash_cadena_ultimo`).
- **Firma del usuario** = firma ECDSA P-256 del registrador sobre `hash_datos`, hecha en su navegador.
