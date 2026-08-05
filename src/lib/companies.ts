import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { COMPANIES_CACHE_REVALIDATE_SECONDS, COMPANIES_CACHE_TAG } from './cache.ts';
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
function buildWhere(q: string, city: string): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  if (city) {
    params.push(city);
    conditions.push(`city = $${params.length}`);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// Сырое чтение из Postgres - без кэша. q/city/page переданы позиционными
// аргументами, а не одним объектом filters, намеренно: unstable_cache ниже
// сам включает JSON.stringify(args) вызова в ключ кэша, и React.cache
// (тоже ниже) дедуплицирует повторные вызовы в пределах одного запроса по
// значению аргументов - оба механизма работают корректно только если
// аргументы - примитивы, которые сравниваются по значению, а не общий
// объект, который сравнивался бы по ссылке (два разных литерала {q, city,
// page} с одинаковым содержимым для React.cache были бы разными вызовами).
async function queryCompanies(
  q: string,
  city: string,
  page: number,
): Promise<{ rows: Company[]; total: number; page: number }> {
  const pool = getPool();
  const { clause, params } = buildWhere(q, city);

  const totalResult = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM companies ${clause}`,
    params,
  );
  const total = Number(totalResult.rows[0].count);

  // Страницу зажимаем здесь, до вычисления offset, а не только при выводе.
  // Номер приходит из чужой или устаревшей ссылки и может указывать далеко
  // за пределы выдачи. Если зажать только подпись, запрос уйдёт с огромным
  // offset, вернёт пусто, и над пустой таблицей окажется правдоподобный
  // диапазон - это хуже явной ошибки, потому что выглядит правдой.
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const offset = (safePage - 1) * PAGE_SIZE;

  const rowsResult = await pool.query<Company>(
    `SELECT id, ext_id, name, category, city, address, rating, reviews_count, site, phone
     FROM companies
     ${clause}
     ORDER BY name ASC, id ASC
     LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}`,
    [...params, offset],
  );

  return { rows: rowsResult.rows, total, page: safePage };
}

// Межзапросный кэш поверх queryCompanies. Ключ кэша у unstable_cache -
// комбинация keyParts ('companies-list') и JSON.stringify(args) вызова, то
// есть каждая уникальная комбинация (q, city, page) получает собственную
// запись, а не одну на всю таблицу - components/страницы с разными
// фильтрами никогда не увидят чужой результат. revalidate и tags - общие
// для companies.ts/anomalies.ts, см. src/lib/cache.ts; сбросить вручную -
// POST /api/revalidate-companies (после npm run load:companies).
const cachedQueryCompanies = unstable_cache(queryCompanies, ['companies-list'], {
  tags: [COMPANIES_CACHE_TAG],
  revalidate: COMPANIES_CACHE_REVALIDATE_SECONDS,
});

// React.cache поверх межзапросного кэша - если в пределах одного рендера
// страницы listCompanies вызовут с теми же q/city/page больше одного раза
// (сейчас этого не происходит - на /companies один вызов в Promise.all в
// page.tsx, - но это не повод не защититься на будущее), повторные вызовы
// схлопнутся в один и не пойдут даже в Data Cache Next.js повторно, не
// говоря о Postgres.
const dedupedQueryCompanies = cache(cachedQueryCompanies);

export async function listCompanies(
  filters: CompanyFilters,
): Promise<{ rows: Company[]; total: number; page: number }> {
  return dedupedQueryCompanies(filters.q, filters.city, filters.page);
}

async function queryCities(): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query<{ city: string }>(
    'SELECT DISTINCT city FROM companies ORDER BY city ASC',
  );
  return result.rows.map((row) => row.city);
}

const cachedQueryCities = unstable_cache(queryCities, ['companies-cities'], {
  tags: [COMPANIES_CACHE_TAG],
  revalidate: COMPANIES_CACHE_REVALIDATE_SECONDS,
});

// Без аргументов - React.cache здесь дедуплицирует тривиально: в пределах
// одного запроса любой повторный вызов listCities() - гарантированный
// повтор одного и того же (единственного) ключа, а не просто вероятный.
export const listCities = cache(cachedQueryCities);
