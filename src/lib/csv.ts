/**
 * Минимальный парсер CSV по RFC 4180: кавычки, удвоенные кавычки внутри
 * поля, запятые внутри кавычек, CRLF и LF. Отдельная зависимость ради
 * тридцати строк не нужна.
 */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < withoutBom.length; i += 1) {
    const char = withoutBom[i];

    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }

    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(field); rows.push(row); field = ''; row = []; continue; }
    field += char;
  }

  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const header = rows.shift() ?? [];
  return { header, rows };
}
