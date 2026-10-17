/**
 * Exportador XLSX con exceljs: una hoja por tabla del reporte, cabecera en
 * negrita + congelada + autofiltro, anchos por columna, fechas ISO.
 */
import ExcelJS from 'exceljs';
import { buildReport } from './report.js';

let sheetN = 0;
function sheetName(name) {
  const base = String(name || 'Datos').replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Datos';
  return `${base}`.slice(0, 31) || `Hoja${++sheetN}`;
}

function addTableSheet(wb, table, fallbackName) {
  const ws = wb.addWorksheet(sheetName(table.name || fallbackName));
  ws.columns = table.columns.map((c) => ({
    header: c.label, key: c.key, width: c.width || 18,
  }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: table.columns.length },
  };
  for (const row of table.rows) ws.addRow(row);
}

function addFichaSheet(wb, ficha, name = 'Ficha') {
  const ws = wb.addWorksheet(sheetName(name));
  ws.columns = [
    { header: 'Campo', key: 'campo', width: 26 },
    { header: 'Valor', key: 'valor', width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const [campo, valor] of ficha) ws.addRow({ campo, valor });
}

/** @returns {Promise<Buffer>} buffer .xlsx real */
export async function renderXlsx(type, dataset) {
  const r = buildReport(type, dataset);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MINDUN LABS';
  wb.created = new Date();

  const meta = wb.addWorksheet('Resumen');
  meta.columns = [
    { header: 'Campo', key: 'k', width: 24 },
    { header: 'Valor', key: 'v', width: 60 },
  ];
  meta.getRow(1).font = { bold: true };
  meta.addRow({ k: 'Exportación', v: r.title });
  meta.addRow({ k: 'Generado', v: r.subtitle });
  meta.addRow({ k: 'Registros', v: r.recordCount });

  if (r.ficha.length) addFichaSheet(wb, r.ficha, 'Ficha');
  for (const table of r.tables) addTableSheet(wb, table);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
