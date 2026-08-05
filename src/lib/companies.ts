import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { COMPANIES_CACHE_REVALIDATE_SECONDS, COMPANIES_CACHE_TAG } from './cache.ts';
import { getPool } from './db.ts';

// Дефолт и одновременно размер скелетона в loading.tsx (см. её комментарий) -
// там нет доступа к searchParams, поэтому скелетон всегда рисует именно это
// число строк-заглушек независимо от того, что выбрано на самой странице.
export const PAGE_SIZE = 25;

// Единственные значения, которые вправе оказаться в LIMIT. ?limit=99999999
// не должен заставлять сервер материализовать всю таблицу на каждый
// запрос - поэтому это не диапазон с максимумом, а перечисление ровно трёх
// значений, и resolvePageSize ниже не пропускает наружу ничего, кроме них.
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export function resolvePageSize(raw: string | undefined): PageSizeOption {
  const parsed = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ? (parsed as PageSizeOption)
    : PAGE_SIZE;
}

// Белый список сортируемых колонок. Это единственное место, где строка из
// URL когда-либо становится именем колонки в SQL-тексте - и она им не
// становится: resolveSortKey ниже возвращает либо один из ключей этого
// объекта (тогда SORTABLE_COLUMNS[key].column - константа из литерала, а не
// то, что пришло по сети), либо DEFAULT_SORT_KEY. buildOrderBy принимает
// только значение типа SortKey (union из этих же ключей), так что сам
// компилятор не даст передать туда произвольную строку - ORDER BY $1
// Postgres не примет (параметром нельзя связать идентификатор), а
// подстановка "очищенной" регэкспом строки - это ровно та SQL-инъекция,
// которой этот файл существует, чтобы избежать.
const SORTABLE_COLUMNS = {
  name: { column: 'name', nullable: false },
  city: { column: 'city', nullable: false },
  category: { column: 'category', nullable: true },
  rating: { column: 'rating', nullable: true },
  reviews_count: { column: 'reviews_count', nullable: false },
} as const;

export type SortKey = keyof typeof SORTABLE_COLUMNS;
export const SORT_KEYS = Object.keys(SORTABLE_COLUMNS) as SortKey[];
export const DEFAULT_SORT_KEY: SortKey = 'name';

export type SortDir = 'asc' | 'desc';
export const DEFAULT_SORT_DIR: SortDir = 'asc';

// Такой же белый список для направления - двухпунктовый словарь, а не
// пропуск строки как есть. 'asc'/'desc' с клиента никогда не долетают до
// SQL-текста сами по себе, только их отображение через этот объект.
const SORT_DIRECTION_SQL: Record<SortDir, 'ASC' | 'DESC'> = {
  asc: 'ASC',
  desc: 'DESC',
};

export function resolveSortKey(raw: string | undefined): SortKey {
  return raw !== undefined && Object.prototype.hasOwnProperty.call(SORTABLE_COLUMNS, raw)
    ? (raw as SortKey)
    : DEFAULT_SORT_KEY;
}

export function resolveSortDir(raw: string | undefined): SortDir {
  return raw === 'desc' ? 'desc' : 'asc';
}

// rating и category допускают NULL (79-100 компаний без рейтинга смотря по
// последней перезагрузке данных, 1 - без категории из-за сдвига колонок в
// review.csv, см. схему). Решение: NULLS LAST всегда, независимо от
// направления. По умолчанию Postgres кладёт NULL в конец при ASC, но в
// начало при DESC - то есть "рейтинг по убыванию" без явного NULLS LAST
// показал бы блок пустых строк первым, а не самые высокие рейтинги. Здесь
// это не годится ни при каком направлении: отсутствие рейтинга - это не
// "меньше нуля" и не "больше пяти", это неизвестно, и неизвестное должно
// уходить в конец списка, а не путаться то сверху, то снизу в зависимости от
// того, каким был последний клик по заголовку.
//
// id ASC - обязательный последний ключ на любой сортировке. Он не влияет на
// видимый порядок (id уникален, совпадений не будет), но без него порядок
// строк с одинаковым значением сортируемой колонки не гарантирован между
// запросами - Postgres ничего не обещает про порядок при равенстве ключа
// сортировки, а LIMIT/OFFSET с "плавающим" порядком означает, что соседние
// страницы могут случайно повторить или пропустить строку.
function buildOrderBy(key: SortKey, dir: SortDir): string {
  const { column, nullable } = SORTABLE_COLUMNS[key];
  const direction = SORT_DIRECTION_SQL[dir];
  const nulls = nullable ? ' NULLS LAST' : '';
  return `${column} ${direction}${nulls}, id ASC`;
}

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
