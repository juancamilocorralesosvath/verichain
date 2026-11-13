import console from 'node:console';
import process from 'node:process';
// Verifica el contraste WCAG 2.x de los pares texto/fondo de src/estilos.css (AA: 4.5 texto, 3 UI).
const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pares = [
  ['tinta sobre papel', '#16202B', '#EEF1EF', 4.5],
  ['tinta sobre superficie', '#16202B', '#FFFFFF', 4.5],
  ['tinta suave sobre papel', '#4A5663', '#EEF1EF', 4.5],
  ['tinta suave sobre superficie', '#4A5663', '#FFFFFF', 4.5],
  ['sello (enlaces) sobre superficie', '#1F3F8F', '#FFFFFF', 4.5],
  ['sello (enlaces) sobre papel', '#1F3F8F', '#EEF1EF', 4.5],
  ['blanco sobre sello (botón)', '#FFFFFF', '#1F3F8F', 4.5],
  ['papel sobre tinta (cabecera)', '#EEF1EF', '#16202B', 4.5],
  ['ok sobre ok-fondo', '#0B5A33', '#E1F2E8', 4.5],
  ['falla sobre falla-fondo', '#9B1B1B', '#FBE6E4', 4.5],
  ['no-aplica sobre no-aplica-fondo', '#46515B', '#E7EBEE', 4.5],
  ['ok sobre superficie', '#0B5A33', '#FFFFFF', 4.5],
  ['falla sobre superficie', '#9B1B1B', '#FFFFFF', 4.5],
  ['aviso sobre aviso-fondo', '#6B4A00', '#FFF3CC', 4.5],
  ['borde de control sobre superficie (UI)', '#6B7782', '#FFFFFF', 3],
  ['anillo de foco sobre papel (UI)', '#1F3F8F', '#EEF1EF', 3],
];
let mal = 0;
for (const [n, f, b, min] of pares) {
  const r = ratio(f, b);
  const ok = r >= min;
  if (!ok) mal++;
  console.log(
    `${ok ? 'OK ' : 'MAL'} ${r.toFixed(2).padStart(5)}:1 (mín ${min})  ${n}  ${f} / ${b}`,
  );
}
process.exit(mal ? 1 : 0);
