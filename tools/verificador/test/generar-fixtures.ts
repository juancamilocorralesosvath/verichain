// Genera los fixtures de las pruebas: una cadena exportada válida, una alterada y los PEM públicos.
// Uso: npm run fixtures -w @bc/verificador   (las llaves privadas se descartan: solo se guardan públicas)
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HASH_CERO,
  HASH_DATOS_GENESIS,
  calcularHashDatos,
  minar,
  type BloqueCadena,
  type FilaPersona,
} from '@bc/core';

const DIFICULTAD = 2;
const destino = join(import.meta.dirname, 'fixtures');
mkdirSync(destino, { recursive: true });

const par = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spkiB64 = (k: ReturnType<typeof par>['publicKey']) =>
  k.export({ format: 'der', type: 'spki' }).toString('base64');
const firmar = (privada: ReturnType<typeof par>['privateKey'], mensaje: string) =>
  sign('sha256', Buffer.from(mensaje, 'ascii'), {
    key: privada,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64');

const usuario = par();
const servidor = par();
const otroServidor = par();

const bloques: BloqueCadena[] = [];
const genesis = minar(HASH_CERO, HASH_DATOS_GENESIS, DIFICULTAD);
bloques.push({
  indice: 0,
  hash_datos: HASH_DATOS_GENESIS,
  nonce: genesis.nonce,
  hash_anterior: HASH_CERO,
  hash_cadena: genesis.hashCadena,
  firma_usuario: null,
  llave_id: null,
  persona: null,
});
const nombres = ['Ana Pérez', 'Luis Gómez', 'María Peña'];
for (let i = 1; i <= 3; i++) {
  const persona: FilaPersona = {
    cedula: String(1000000 + i),
    nombre: nombres[i - 1] as string,
    // texto cifrado de ejemplo (el verificador solo ve el cifrado, nunca el dato en claro)
    direccion_cifrada: Buffer.from(`direccion-cifrada-${i}`.padEnd(40, 'x')).toString('base64'),
    telefono_cifrado: Buffer.from(`telefono-cifrado-${i}`.padEnd(40, 'y')).toString('base64'),
    creado_en: `2026-11-12T10:0${i}:00.000Z`,
    creado_por: 'registrador1',
  };
  const hash_datos = calcularHashDatos(persona);
  const anterior = bloques[i - 1] as BloqueCadena;
  const minado = minar(anterior.hash_cadena, hash_datos, DIFICULTAD);
  bloques.push({
    indice: i,
    hash_datos,
    nonce: minado.nonce,
    hash_anterior: anterior.hash_cadena,
    hash_cadena: minado.hashCadena,
    firma_usuario: firmar(usuario.privateKey, hash_datos),
    llave_id: 1,
    persona,
  });
}
const ultimo = bloques[bloques.length - 1] as BloqueCadena;
const spkiServidor = spkiB64(servidor.publicKey);
const exportacion = {
  formato: 'bc-export/1',
  exportado_en: '2026-11-12T10:30:00.000Z',
  dificultad: DIFICULTAD,
  bloques,
  llaves_usuarios: { '1': spkiB64(usuario.publicKey) },
  sello: {
    indice: ultimo.indice,
    hash_cadena: ultimo.hash_cadena,
    firma: firmar(servidor.privateKey, `${ultimo.indice}:${ultimo.hash_cadena}`),
  },
  llave_servidor_spki_b64: spkiServidor,
  huella_llave_servidor: createHash('sha256')
    .update(Buffer.from(spkiServidor, 'base64'))
    .digest('hex'),
};

// alterada: se cambia el nombre de la persona del bloque 2 sin recalcular nada (modificar-dato)
const alterada = structuredClone(exportacion);
(alterada.bloques[2] as BloqueCadena & { persona: FilaPersona }).persona.nombre = 'Mallory';

const pem = (k: ReturnType<typeof par>['publicKey']) => k.export({ format: 'pem', type: 'spki' });
writeFileSync(join(destino, 'cadena-valida.json'), JSON.stringify(exportacion, null, 2) + '\n');
writeFileSync(join(destino, 'cadena-alterada.json'), JSON.stringify(alterada, null, 2) + '\n');
writeFileSync(join(destino, 'server-public.pem'), pem(servidor.publicKey));
writeFileSync(join(destino, 'otra-llave-public.pem'), pem(otroServidor.publicKey));
process.stdout.write(`Fixtures generados en ${destino}\n`);
