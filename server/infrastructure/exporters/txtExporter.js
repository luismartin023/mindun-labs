/**
 * Exportador TXT: secciones con separadores ──, UTF-8, tildes intactas.
 * Los campos nulos se omiten (nunca se inventa "Sin registrar" en el archivo).
 */
import { buildReport } from './report.js';

const SEP = '─'.repeat(56);
const SUBSEP = '-'.repeat(40);

/** @returns {string} contenido .txt */
export function renderTxt(type, dataset) {
  const r = buildReport(type, dataset);
  const out = [];
  out.push(SEP);
  out.push(`  ${r.title}`);
  out.push(`  ${r.subtitle}`);
  out.push(`  Registros: ${r.recordCount}`);
  out.push(SEP);
  out.push('');

  if (r.ficha.length) {
    for (const [label, value] of r.ficha) out.push(`${label}: ${value}`);
    out.push('');
  }

  for (const table of r.tables) {
    if (!table.rows.length) continue;
    out.push(`── ${table.name} ${SUBSEP.slice(table.name.length + 4)}`);
    out.push(table.columns.map((c) => c.label).join('  |  '));
    out.push(SUBSEP);
    for (const row of table.rows) {
      out.push(table.columns.map((c) => row[c.key] ?? '').join('  |  '));
    }
    out.push('');
  }

  out.push(SEP);
  return out.join('\r\n');
}
