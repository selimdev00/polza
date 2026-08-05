import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool, getPool } from '../src/lib/db.ts';
import { ingest, type SourceRecord } from '../src/lib/ingest.ts';
import { parseCsv } from '../src/lib/csv.ts';
import type { RawRow } from '../src/lib/dedup.ts';

const csvPath = resolve(import.meta.dirname, '../data/review.csv');

const COLUMN_TO_FIELD: Record<string, keyof RawRow> = {
  id: 'ext_id',
  name: 'name',
  category: 'category',
  city: 'city',
  address: 'address',
  rating: 'rating',
  reviews_count: 'reviews_count',
  site: 'site',
  phone: 'phone',
};

function emptyRow(): RawRow {
  return {
    ext_id: null, name: null, category: null, city: null, address: null,
    rating: null, reviews_count: null, site: null, phone: null,
  };
}

async function main(): Promise<void> {
  const text = await readFile(csvPath, 'utf8');
  const { header, rows } = parseCsv(text);

  console.log(`Колонки: ${header.join(', ')}`);
  console.log(`Строк данных: ${rows.length}`);

  const records: SourceRecord[] = rows.map((cells, index) => {
    const row = emptyRow();
    const raw: Record<string, string> = {};
    header.forEach((column, columnIndex) => {
      const value = cells[columnIndex] ?? '';
      raw[column] = value;
      const field = COLUMN_TO_FIELD[column.trim()];
      if (field) row[field] = value;
    });
    return { row, sourceFile: 'review.csv', sourceRow: index + 2, raw };
  });

  const runStartedAt = new Date();
  const stats = await ingest(records, 'review_csv');

  console.log('');
  console.log('Загрузка review.csv');
  console.log(`  в staging:             ${stats.staged}`);
  console.log(`  вставлено в companies: ${stats.inserted}`);
  console.log(`  слито по ext_id:       ${stats.mergedExtId}`);
  console.log(`  слито по dedup_key:    ${stats.mergedShadow}`);
  console.log(`  отброшено строк:       ${stats.dropped}`);
  console.log(`  починено полей:        ${stats.repaired}`);
  console.log(`  обнулено полей:        ${stats.nulled}`);

  const pool = getPool();
  // Выборка ограничена текущим запуском по created_at. Без этого повторный
  // запуск загрузчика по неочищенной базе показал бы вперемешку старые и
  // новые записи журнала, и отчёт врал бы, ничем это не выдав.
  const shadow = await pool.query<{ ext_id: string; new_value: string; detail: string }>(
    `SELECT ext_id, new_value, detail FROM ingest_issues
     WHERE code = 'shadow_duplicate'
       AND source_file = 'review.csv'
       AND created_at >= $1
     ORDER BY ext_id`,
    [runStartedAt],
  );
  if (shadow.rowCount) {
    console.log('');
    console.log('Теневые дубли (та же компания под новым id):');
    for (const issue of shadow.rows) {
      console.log(`  ${issue.ext_id} -> уже загружена как ${issue.new_value}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
