/**
 * Exportador PDF con jsPDF + jspdf-autotable (CommonJS → createRequire).
 * Título + fecha + filtros + nº de registros; tablas con autotable; fichas
 * en layout clave-valor. Helvetica cubre latin-1 (tildes OK).
 */
import { createRequire } from 'node:module';
import { buildReport } from './report.js';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');
const autoTableMod = require('jspdf-autotable');
const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;

function runAutoTable(doc, opts) {
  if (typeof autoTable === 'function') autoTable(doc, opts);
  else doc.autoTable(opts);
}

const M = 14; // margen (mm)

/** @returns {Buffer} buffer PDF real (%PDF-…) */
export function renderPdf(type, dataset) {
  const r = buildReport(type, dataset);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = M;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(r.title), M, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(String(r.subtitle), M, y);
  y += 5;
  doc.text(`Registros: ${r.recordCount}`, M, y);
  doc.setTextColor(0);
  y += 6;

  if (r.ficha.length) {
    runAutoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Campo', 'Valor']],
      body: r.ficha.map(([k, v]) => [k, String(v)]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6 },
      headStyles: { fillColor: [40, 40, 40] },
      columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
    });
    y = (doc.lastAutoTable?.finalY || y) + 8;
  }

  for (const table of r.tables) {
    if (!table.rows.length) continue;
    if (y > 250) { doc.addPage(); y = M; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(String(table.name), M, y);
    y += 3;
    runAutoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [table.columns.map((c) => c.label)],
      body: table.rows.map((row) => table.columns.map((c) => row[c.key] ?? '')),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, overflow: 'linebreak' },
      headStyles: { fillColor: [40, 40, 40] },
      tableWidth: pageW - M * 2,
    });
    y = (doc.lastAutoTable?.finalY || y) + 8;
  }

  const buf = doc.output('arraybuffer');
  return Buffer.from(buf);
}
