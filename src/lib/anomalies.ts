import { getPool } from './db.ts';
import { CODE_DESCRIPTIONS } from './anomaly-codes.ts';

// Русская подпись для disposition. report-anomalies.ts печатает значение как
// есть в markdown-таблице ("row_merged" и т.п.) - в модалке это меньше
// уместно, поэтому короткая русская подпись живёт здесь, а не в общем
// anomaly-codes.ts: отчёту она не нужна.
const DISPOSITION_LABELS: Record<string, string> = {
  row_dropped: 'строка отброшена',
  row_merged: 'строка слита',
  field_nulled: 'поле обнулено',
  field_repaired: 'поле исправлено',
};

function dispositionLabel(disposition: string): string {
  return DISPOSITION_LABELS[disposition] ?? disposition;
}

// Пробел на границе значения не виден на странице точно так же, как не
// виден в отрендеренном markdown (см. escapeCell в report-anomalies.ts) - и
// именно такой пробел оказался одной из реально подсаженных аномалий
// (city_canonicalized, c_001184: "Москва " с хвостовым пробелом). Отмечаем
// его тем же маркером, что и в отчёте, чтобы два представления одного и
// того же журнала не разошлись в способе показа.
function markEdgeWhitespace(value: string | null): string | null {
  if (value === null) return null;
  return value.replace(/^ /, '·').replace(/ $/, '·');
}

export interface AnomalyExample {
  extId: string | null;
  sourceFile: string;
  sourceRow: number;
  field: string | null;
  rawValue: string | null;
  newValue: string | null;
}

export interface AnomalyCodeGroup {
  code: string;
  title: string;
  how: string;
  disposition: string;
  count: number;
  examples: AnomalyExample[];
}

export interface CompanyIssue {
  code: string;
  title: string;
  disposition: string;
  sourceFile: string;
  sourceRow: number;
  field: string | null;
  rawValue: string | null;
  newValue: string | null;
  detail: string | null;
}

export interface AnomalyJournal {
  totalCount: number;
  byCode: AnomalyCodeGroup[];
  // Ключ - ext_id компании. Заполняется только для строк ingest_issues, у
  // которых ext_id не пуст: у полностью пустых строк (empty_row) его просто
  // нет, и метку в таблице компаний ставить не на что.
  byExtId: Record<string, CompanyIssue[]>;
}

// Сколько примеров показывать на код в модалке. В ANOMALIES.md лимит 10
// (EXAMPLE_LIMIT в report-anomalies.ts) - там это единственный источник
// правды, и его читают целиком. Модалка компактнее и открывается поверх
// рабочей страницы, поэтому лимит здесь меньше - осознанно другое число для
// другого места, а не рассинхронизация с отчётом.
const MODAL_EXAMPLE_LIMIT = 5;

interface IssueRow {
  code: string;
  disposition: string;
  ext_id: string | null;
  source_file: string;
  source_row: number;
  field: string | null;
  raw_value: string | null;
  new_value: string | null;
  detail: string | null;
}

/**
 * Журнал аномалий целиком - одним запросом. ingest_issues сейчас на
 * несколько десятков строк на всю базу (не на страницу компаний), поэтому
 * дешевле прочитать её целиком и посчитать сводку по кодам и карту по
 * ext_id в JS, чем делать отдельный запрос на сводку, отдельный на примеры
 * и уж тем более запрос на каждую строку таблицы компаний. Строится один
 * раз за рендер страницы и используется и глобальной модалкой (byCode,
 * totalCount), и меткой в каждой строке таблицы (byExtId).
 */
export async function getAnomalyJournal(): Promise<AnomalyJournal> {
  const pool = getPool();
  const result = await pool.query<IssueRow>(
    `SELECT code, disposition, ext_id, source_file, source_row, field, raw_value, new_value, detail
     FROM ingest_issues
     ORDER BY code ASC, id ASC`,
  );

  const groups = new Map<string, AnomalyCodeGroup>();
  const byExtId: Record<string, CompanyIssue[]> = {};

  for (const row of result.rows) {
    const meta = CODE_DESCRIPTIONS[row.code];
    const title = meta?.title ?? row.code;
    const how = meta?.how ?? '';
    const disposition = dispositionLabel(row.disposition);
    const rawValue = markEdgeWhitespace(row.raw_value);
    const newValue = markEdgeWhitespace(row.new_value);

    // Группируем по code+disposition, как GROUP BY в report-anomalies.ts -
    // не предполагаем заранее, что у кода ровно одна disposition.
    const groupKey = `${row.code}::${row.disposition}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { code: row.code, title, how, disposition, count: 0, examples: [] };
      groups.set(groupKey, group);
    }
    group.count += 1;
    if (group.examples.length < MODAL_EXAMPLE_LIMIT) {
      group.examples.push({
        extId: row.ext_id,
        sourceFile: row.source_file,
        sourceRow: row.source_row,
        field: row.field,
        rawValue,
        newValue,
      });
    }

    if (row.ext_id) {
      const list = byExtId[row.ext_id] ?? (byExtId[row.ext_id] = []);
      list.push({
        code: row.code,
        title,
        disposition,
        sourceFile: row.source_file,
        sourceRow: row.source_row,
        field: row.field,
        rawValue,
        newValue,
        detail: row.detail,
      });
    }
  }

  const byCode = [...groups.values()].sort(
    (a, b) => b.count - a.count || a.code.localeCompare(b.code),
  );

  return { totalCount: result.rows.length, byCode, byExtId };
}
