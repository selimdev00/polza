import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool } from '../src/lib/db.ts';
import { ingest, type SourceRecord } from '../src/lib/ingest.ts';
import type { RawRow } from '../src/lib/dedup.ts';

const dataDir = resolve(import.meta.dirname, '../data');

interface ApiItem {
  id?: unknown; name?: unknown; category?: unknown; city?: unknown;
  address?: unknown; rating?: unknown; reviews_count?: unknown;
  site?: unknown; phone?: unknown;
}

interface ApiPage {
  page?: number;
  per_page?: number;
  total?: number;
  items?: ApiItem[];
}

// В выгрузке всё приходит уже типизированным, но staging принимает только
// текст: приводим здесь, чтобы дальше оба загрузчика работали одинаково.
function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function toRawRow(item: ApiItem): RawRow {
  return {
    ext_id: toText(item.id),
    name: toText(item.name),
    category: toText(item.category),
    city: toText(item.city),
    address: toText(item.address),
    rating: toText(item.rating),
    reviews_count: toText(item.reviews_count),
    site: toText(item.site),
    phone: toText(item.phone),
  };
}

async function main(): Promise<void> {
  const files = (await readdir(dataDir))
    .filter((file) => /^page_\d+\.json$/.test(file))
    .sort();

  if (!files.length) throw new Error(`Не найдено ни одного page_*.json в ${dataDir}`);

  const records: SourceRecord[] = [];
  let advertisedTotal: number | null = null;

  for (const file of files) {
    const page = JSON.parse(await readFile(resolve(dataDir, file), 'utf8')) as ApiPage;
    if (advertisedTotal === null && typeof page.total === 'number') advertisedTotal = page.total;

    const items = page.items ?? [];
    items.forEach((item, index) => {
      records.push({
        row: toRawRow(item),
        sourceFile: file,
        sourceRow: index + 1,
        raw: item,
      });
    });
  }

  console.log(`Файлов: ${files.length}, строк во всех файлах: ${records.length}`);

  const stats = await ingest(records, 'api_pages');

  console.log('');
  console.log('Загрузка выгрузки из API');
  console.log(`  в staging:            ${stats.staged}`);
  console.log(`  вставлено в companies: ${stats.inserted}`);
  console.log(`  слито по ext_id:       ${stats.mergedExtId}`);
  console.log(`  слито по dedup_key:    ${stats.mergedShadow}`);
  console.log(`  отброшено строк:       ${stats.dropped}`);
  console.log(`  починено полей:        ${stats.repaired}`);
  console.log(`  обнулено полей:        ${stats.nulled}`);

  if (advertisedTotal !== null && advertisedTotal !== stats.inserted) {
    console.log('');
    console.log(
      `Внимание: API сообщает total=${advertisedTotal}, а уникальных компаний ${stats.inserted}. ` +
      `Расхождение ${advertisedTotal - stats.inserted}.`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
