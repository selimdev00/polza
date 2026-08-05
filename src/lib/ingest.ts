import type { PoolClient } from 'pg';
import { getPool } from './db.ts';
import { buildDedupKey, detectColumnShift, type RawRow } from './dedup.ts';
import {
  canonicalCity,
  normalizePhone,
  normalizeSite,
  parseRating,
  parseReviewsCount,
  repairMojibake,
} from './normalize.ts';

export interface SourceRecord {
  row: RawRow;
  sourceFile: string;
  sourceRow: number;
  raw: unknown;
}

export interface IngestStats {
  staged: number;
  inserted: number;
  mergedExtId: number;
  mergedShadow: number;
  dropped: number;
  repaired: number;
  nulled: number;
}

type Disposition = 'row_dropped' | 'row_merged' | 'field_nulled' | 'field_repaired';

interface IssueDraft {
  disposition: Disposition;
  code: string;
  field?: string;
  rawValue?: string | null;
  newValue?: string | null;
  detail?: string;
}

async function logIssue(
  client: PoolClient,
  stagingId: number | null,
  record: SourceRecord,
  issue: IssueDraft,
): Promise<void> {
  await client.query(
    `INSERT INTO ingest_issues
       (staging_id, source_file, source_row, ext_id, disposition, code, field, raw_value, new_value, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      stagingId,
      record.sourceFile,
      record.sourceRow,
      record.row.ext_id,
      issue.disposition,
      issue.code,
      issue.field ?? null,
      issue.rawValue ?? null,
      issue.newValue ?? null,
      issue.detail ?? null,
    ],
  );
}

function isBlank(row: RawRow): boolean {
  return Object.values(row).every((value) => (value ?? '').trim() === '');
}

export async function ingest(
  records: SourceRecord[],
  source: 'api_pages' | 'review_csv',
): Promise<IngestStats> {
  const pool = getPool();
  const client = await pool.connect();
  const stats: IngestStats = {
    staged: 0, inserted: 0, mergedExtId: 0, mergedShadow: 0,
    dropped: 0, repaired: 0, nulled: 0,
  };

  try {
    await client.query('BEGIN');

    for (const record of records) {
      // 1. Слой staging: пишем как пришло, до любой валидации.
      const staged = await client.query<{ id: string }>(
        `INSERT INTO staging_companies
           (source_file, source_row, raw, ext_id, name, category, city, address, rating, reviews_count, site, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          record.sourceFile, record.sourceRow, JSON.stringify(record.raw),
          record.row.ext_id, record.row.name, record.row.category, record.row.city,
          record.row.address, record.row.rating, record.row.reviews_count,
          record.row.site, record.row.phone,
        ],
      );
      const stagingId = Number(staged.rows[0].id);
      stats.staged += 1;

      // 2. Пустая строка - выбрасываем, но с записью в журнал.
      if (isBlank(record.row)) {
        await logIssue(client, stagingId, record, {
          disposition: 'row_dropped', code: 'empty_row',
          detail: 'Все поля пустые',
        });
        stats.dropped += 1;
        continue;
      }

      // 3. Сдвиг колонок - чиним до всего остального.
      const shift = detectColumnShift(record.row);
      let row = shift.row;
      if (shift.shifted) {
        await logIssue(client, stagingId, record, {
          disposition: 'field_repaired', code: 'column_shift_repaired',
          field: 'category,city,address',
          rawValue: `category=${record.row.category}; city=${record.row.city}; address=${record.row.address}`,
          newValue: `category=NULL; city=${row.city}; address=${row.address}`,
          detail: 'В category лежал город, в city - адрес, address пуст. Значение категории потеряно на выгрузке.',
        });
        stats.repaired += 1;
        stats.nulled += 1;
      }

      // 4. Обязательные поля.
      const extId = (row.ext_id ?? '').trim();
      const rawName = (row.name ?? '').trim();
      if (!extId || !rawName) {
        await logIssue(client, stagingId, record, {
          disposition: 'row_dropped', code: 'missing_identity',
          detail: 'Нет id или названия - строку невозможно идентифицировать',
        });
        stats.dropped += 1;
        continue;
      }

      // 5. Название: чиним моджибейк, но храним человекочитаемое как есть.
      const name = repairMojibake(rawName);
      if (name !== rawName) {
        await logIssue(client, stagingId, record, {
          disposition: 'field_repaired', code: 'mojibake_repaired',
          field: 'name', rawValue: rawName, newValue: name,
          detail: 'utf-8 байты были прочитаны как cp1251',
        });
        stats.repaired += 1;
      }

      // 6. Город: обязателен, поэтому строка без распознанного города выбывает.
      const rawCity = (row.city ?? '').trim();
      const city = canonicalCity(rawCity);
      if (!city.value) {
        await logIssue(client, stagingId, record, {
          disposition: 'row_dropped', code: 'city_unrecognized',
          field: 'city', rawValue: rawCity,
          detail: 'Значение не сопоставилось ни с одним известным городом',
        });
        stats.dropped += 1;
        continue;
      }
      if (city.repaired) {
        await logIssue(client, stagingId, record, {
          disposition: 'field_repaired', code: 'city_canonicalized',
          field: 'city', rawValue: rawCity, newValue: city.value,
        });
        stats.repaired += 1;
      }

      // 7. Остальные поля: чиним что можно, обнуляем что нельзя.
      const rating = parseRating(row.rating);
      if (rating.code) {
        await logIssue(client, stagingId, record, {
          disposition: rating.value === null ? 'field_nulled' : 'field_repaired',
          code: rating.code, field: 'rating',
          rawValue: row.rating, newValue: rating.value === null ? null : String(rating.value),
        });
        if (rating.value === null) stats.nulled += 1; else stats.repaired += 1;
      }

      const reviews = parseReviewsCount(row.reviews_count);
      if (reviews.code) {
        await logIssue(client, stagingId, record, {
          disposition: 'field_repaired', code: reviews.code, field: 'reviews_count',
          rawValue: row.reviews_count, newValue: String(reviews.value),
        });
        stats.repaired += 1;
      }

      const site = normalizeSite(row.site);
      if (site.code) {
        await logIssue(client, stagingId, record, {
          disposition: site.value === null ? 'field_nulled' : 'field_repaired',
          code: site.code, field: 'site', rawValue: row.site, newValue: site.value,
        });
        if (site.value === null) stats.nulled += 1; else stats.repaired += 1;
      }

      const phone = normalizePhone(row.phone);
      if (phone.code) {
        await logIssue(client, stagingId, record, {
          disposition: 'field_nulled', code: phone.code, field: 'phone',
          rawValue: row.phone, newValue: null,
        });
        stats.nulled += 1;
      }

      const category = (row.category ?? '').trim() || null;
      const address = (row.address ?? '').trim() || null;
      const dedupKey = buildDedupKey({ name, city: city.value, address });

      // 8. Слой companies. Два прохода дедупликации:
      //    ext_id ловит повторную выгрузку той же записи,
      //    dedup_key ловит ту же компанию под другим id.
      const byExtId = await client.query<{ id: string }>(
        'SELECT id FROM companies WHERE ext_id = $1', [extId],
      );
      if (byExtId.rowCount) {
        await client.query('UPDATE companies SET last_seen_at = now() WHERE ext_id = $1', [extId]);
        await logIssue(client, stagingId, record, {
          disposition: 'row_merged', code: 'duplicate_ext_id',
          field: 'ext_id', rawValue: extId,
          detail: `Запись с таким id уже загружена (companies.id=${byExtId.rows[0].id})`,
        });
        stats.mergedExtId += 1;
        continue;
      }

      const byDedupKey = await client.query<{ id: string; ext_id: string }>(
        'SELECT id, ext_id FROM companies WHERE dedup_key = $1', [dedupKey],
      );
      if (byDedupKey.rowCount) {
        const existing = byDedupKey.rows[0];
        await client.query('UPDATE companies SET last_seen_at = now() WHERE id = $1', [existing.id]);
        await logIssue(client, stagingId, record, {
          disposition: 'row_merged', code: 'shadow_duplicate',
          field: 'dedup_key', rawValue: extId, newValue: existing.ext_id,
          detail: `Та же компания (название/город/адрес совпали после нормализации) уже загружена под id ${existing.ext_id}`,
        });
        stats.mergedShadow += 1;
        continue;
      }

      await client.query(
        `INSERT INTO companies
           (ext_id, name, category, city, address, rating, reviews_count, site, phone, phone_raw, dedup_key, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          extId, name, category, city.value, address,
          rating.value, reviews.value, site.value, phone.value,
          (row.phone ?? '').trim() || null, dedupKey, source,
        ],
      );
      stats.inserted += 1;
    }

    await client.query('COMMIT');
    return stats;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
