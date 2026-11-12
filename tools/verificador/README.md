# @bc/verificador

CLI que verifica una cadena exportada **sin confiar en el servidor** (diseño §5.9): recalcula los hashes, el PoW,
las firmas de los usuarios y el sello del servidor usando solo `@bc/core` y `node:crypto`.

```bash
npm run build
npx verificador cadena-AAAAMMDD-HHmm.json --server-key server-public.pem [--json]
```

- `cadena-….json`: lo descarga un admin o auditor de `GET /api/cadena/exportar`.
- `server-public.pem`: la llave pública del servidor, obtenida **por un canal aparte** (`apps/api/secrets/server-public.pem`
  o `GET /api/cadena/llave-servidor`) y comparada con su huella SHA-256. Se usa **siempre** la fijada; si su huella no
  coincide con la que trae el JSON, el CLI muestra una advertencia.
- `--json` imprime el `ReporteCadena` crudo; sin él, un informe en español (tabla por bloque con ✔/✘, sello y veredicto).
- Código de salida: `0` íntegra, `1` comprometida, `2` error de uso o de archivo.

Los fixtures de las pruebas (`test/fixtures/`) se regeneran con `npm run fixtures -w @bc/verificador`; solo contienen
llaves públicas.
