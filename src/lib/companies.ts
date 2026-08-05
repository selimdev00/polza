import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { COMPANIES_CACHE_REVALIDATE_SECONDS, COMPANIES_CACHE_TAG } from './cache.ts';
import {
  buildOrderBy,
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  parseCompanyPageParams,
  resolvePageSize,
  resolveSortDir,
  resolveSortKey,
  SORT_KEYS,
  type CompanyPageParams,
  type PageSizeOption,
  type SortDir,
  type SortKey,
} from './company-params.ts';
import { getPool } from './db.ts';

// Белый список сортировки/лимита живёт в company-params.ts, а не здесь -
// этот модуль тянет getPool из ./db.ts, а тот - пакет 'pg'. Клиентские
// компоненты (filters.tsx, page-size-select.tsx) импортируют
// PAGE_SIZE/PAGE_SIZE_OPTIONS напрямую из company-params.ts, минуя этот
// файл: если бы они брали их отсюда, Next.js утянул бы 'pg' (а через него -
// Node-only модуль 'dns') в браузерный бандл и страница падала бы с 500 при
// первой же загрузке. Реэкспорт ниже сохраняет прежние импорты
// '@/lib/companies' рабочими для серверного кода (page.tsx, тесты).
export {
  buildOrderBy,
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  parseCompanyPageParams,
  resolvePageSize,
  resolveSortDir,
  resolveSortKey,
  SORT_KEYS,
  type CompanyPageParams,
  type PageSizeOption,
  type SortDir,
  type SortKey,
};

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
  category: string;
  hasSite: boolean;
  sort: SortKey;
  dir: SortDir;
  pageSize: PageSizeOption;
  page: number;
}

/**
 * Условия собираются в массив, а не пишутся как «($1 = '' OR city = $1)».
 * Второй вариант короче, но планировщик на нём не может использовать
 * индексы: предикат перестаёт быть сравнением колонки с константой.
 */
function buildWhere(
  q: string,
  city: string,
  category: string,
  hasSite: boolean,
): { clause: string; params: unknown[] } {
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
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (hasSite) {
    // Статичное условие без параметра - hasSite это флаг, а не значение,
    // подставлять в WHERE тут нечего.
    conditions.push(`site IS NOT NULL`);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// Сырое чтение из Postgres - без кэша. Аргументы переданы позиционно, а не
// одним объектом filters, намеренно: unstable_cache ниже сам включает
// JSON.stringify(args) вызова в ключ кэша, и React.cache (тоже ниже)
// дедуплицирует повторные вызовы в пределах одного запроса по значению
// аргументов - оба механизма работают корректно только если аргументы -
// примитивы, которые сравниваются по значению, а не общий объект, который
// сравнивался бы по ссылке. Это же попутно решает и другую задачу: каждый
// новый параметр (category, hasSite, sort, dir, pageSize) - это новая
// позиция в этом списке, а значит автоматически новая часть ключа кэша.
// Забыть добавить параметр в ключ здесь физически нельзя - если он не
// передан сюда, он и не влияет на запрос, а если передан, JSON.stringify
// увидит его вместе с остальными.
async function queryCompanies(
  q: string,
  city: string,
  category: string,
  hasSite: boolean,
  sort: SortKey,
  dir: SortDir,
  pageSize: PageSizeOption,
  page: number,
): Promise<{ rows: Company[]; total: number; page: number; pageSize: PageSizeOption }> {
  const pool = getPool();
  const { clause, params } = buildWhere(q, city, category, hasSite);

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
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const offset = (safePage - 1) * pageSize;

  // orderBy собран из buildOrderBy: и колонка, и направление - константы из
  // хардкод-словарей выше, никогда не сырой sort/dir из URL. LIMIT/OFFSET -
  // тоже не текстовая подстановка pageSize, а обычные связанные параметры:
  // Postgres прекрасно принимает LIMIT $1, в отличие от ORDER BY $1, так что
  // никакой необходимости интерполировать число в текст запроса нет вообще.
  const orderBy = buildOrderBy(sort, dir);
  const rowsResult = await pool.query<Company>(
    `SELECT id, ext_id, name, category, city, address, rating, reviews_count, site, phone
     FROM companies
     ${clause}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );

  return { rows: rowsResult.rows, total, page: safePage, pageSize };
}

// Межзапросный кэш поверх queryCompanies. Ключ кэша у unstable_cache -
// комбинация keyParts ('companies-list') и JSON.stringify(args) вызова, то
// есть каждая уникальная комбинация (q, city, category, hasSite, sort, dir,
// pageSize, page) получает собственную запись, а не одну на всю таблицу -
// components/страницы с разными фильтрами или сортировкой никогда не увидят
// чужой результат. revalidate и tags - общие для companies.ts/anomalies.ts,
// см. src/lib/cache.ts; сбросить вручную - POST /api/revalidate-companies
// (после npm run load:companies).
const cachedQueryCompanies = unstable_cache(queryCompanies, ['companies-list'], {
  tags: [COMPANIES_CACHE_TAG],
  revalidate: COMPANIES_CACHE_REVALIDATE_SECONDS,
});

// React.cache поверх межзапросного кэша - если в пределах одного рендера
// страницы listCompanies вызовут с теми же аргументами больше одного раза
// (сейчас этого не происходит - на /companies один вызов в Promise.all в
// page.tsx, - но это не повод не защититься на будущее), повторные вызовы
// схлопнутся в один и не пойдут даже в Data Cache Next.js повторно, не
// говоря о Postgres.
const dedupedQueryCompanies = cache(cachedQueryCompanies);

export async function listCompanies(
  filters: CompanyFilters,
): Promise<{ rows: Company[]; total: number; page: number; pageSize: PageSizeOption }> {
  return dedupedQueryCompanies(
    filters.q,
    filters.city,
    filters.category,
    filters.hasSite,
    filters.sort,
    filters.dir,
    filters.pageSize,
    filters.page,
  );
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

async function queryCategories(): Promise<string[]> {
  const pool = getPool();
  // NULL (одна строка со сдвинутыми колонками, см. схему) сюда не попадает -
  // "показать компании без категории" в выпадающем списке фильтра не нужен,
  // категорию-пустую-строку в WHERE всё равно нечем было бы сравнить.
  const result = await pool.query<{ category: string }>(
    'SELECT DISTINCT category FROM companies WHERE category IS NOT NULL ORDER BY category ASC',
  );
  return result.rows.map((row) => row.category);
}

const cachedQueryCategories = unstable_cache(queryCategories, ['companies-categories'], {
  tags: [COMPANIES_CACHE_TAG],
  revalidate: COMPANIES_CACHE_REVALIDATE_SECONDS,
});

export const listCategories = cache(cachedQueryCategories);
