// Safe CSV generation: RFC 4180 quoting plus spreadsheet formula-injection protection.

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralize cells that spreadsheet apps would interpret as formulas (CSV injection).
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** columns: [{ key, header }] */
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}
