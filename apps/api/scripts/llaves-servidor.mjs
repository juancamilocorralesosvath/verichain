// Genera la llave de firma del servidor (ECDSA P-256) para el sello de la cadena (diseño §5.4).
// Uso: npm run llaves:servidor -w @bc/api
// La privada queda en SERVER_SIGNING_KEY_PATH (PKCS8, modo 600) y la pública en server-public.pem a su lado.
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const rutaPrivada = resolve(
  process.env.SERVER_SIGNING_KEY_PATH || './secrets/server-signing-key.pem',
);
const rutaPublica = join(dirname(rutaPrivada), 'server-public.pem');
const hayPrivada = existsSync(rutaPrivada);
const hayPublica = existsSync(rutaPublica);

if (hayPrivada && hayPublica) {
  process.stdout.write(
    `Ya existen las llaves del servidor; no se sobrescriben:\n  ${rutaPrivada}\n  ${rutaPublica}\n`,
  );
} else if (hayPrivada || hayPublica) {
  process.stderr.write(
    `Solo existe una de las dos llaves (${hayPrivada ? rutaPrivada : rutaPublica}). ` +
      'No se toca nada: revisa la carpeta o bórrala por completo para generar un par nuevo.\n',
  );
  process.exitCode = 1;
} else {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  mkdirSync(dirname(rutaPrivada), { recursive: true, mode: 0o700 });
  // flag 'wx': falla si el archivo apareció mientras tanto, nunca sobrescribe
  writeFileSync(rutaPrivada, privateKey.export({ format: 'pem', type: 'pkcs8' }), {
    mode: 0o600,
    flag: 'wx',
  });
  chmodSync(rutaPrivada, 0o600);
  writeFileSync(rutaPublica, publicKey.export({ format: 'pem', type: 'spki' }), {
    mode: 0o644,
    flag: 'wx',
  });
  process.stdout.write(
    `Llaves del servidor creadas:\n  ${rutaPrivada} (privada, no la compartas)\n  ${rutaPublica} (pública)\n`,
  );
}
