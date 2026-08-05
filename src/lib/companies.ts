import { getPool } from './db.ts';

export const PAGE_SIZE = 25;

export interface Company {
  id: number;
  ext_id: string;
  name: string;
  category: string | null;
  city: string;
  address: string | null;
  rating: number | null;
  reviews_count: number;
  site: string | null;
  phone: string | null;
}

export interface CompanyFilters {
  q: string;
  city: string;
  page: number;
}

/**
 * Условия собираются в массив, а не пишутся как «($1 = '' OR city = $1)».
 * Второй вариант короче, но планировщик на нём не может использовать
 * индексы: предикат перестаёт быть сравнением колонки с константой.
 */
function buildWhere(filters: CompanyFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  if (filters.city) {
    params.push(filters.city);
    conditions.push(`city = $${params.length}`);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export async function listCompanies(
  filters: CompanyFilters,
): Promise<{ rows: Company[]; total: number }> {
  const pool = getPool();
  const { clause, params } = buildWhere(filters);

  const totalResult = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM companies ${clause}`,
    params,
  );
  const total = Number(totalResult.rows[0].count);

  const offset = Math.max(0, (filters.page - 1) * PAGE_SIZE);
  const rowsResult = await pool.query<Company>(
    `SELECT id, ext_id, name, category, city, address, rating, reviews_count, site, phone
     FROM companies
     ${clause}
     ORDER BY name ASC, id ASC
     LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}`,
    [...params, offset],
  );

  return { rows: rowsResult.rows, total };
}

export async function listCities(): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query<{ city: string }>(
    'SELECT DISTINCT city FROM companies ORDER BY city ASC',
  );
  return result.rows.map((row) => row.city);
}
