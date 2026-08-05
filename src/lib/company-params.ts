// Чистая, не зависящая от `pg` логика вокруг URL-параметров списка компаний
// (лимит страницы, ключ и направление сортировки) - вынесена из
// companies.ts в отдельный модуль намеренно. companies.ts импортирует
// getPool из ./db.ts, а тот - пакет 'pg'; если клиентский компонент
// ('use client') импортирует что угодно из companies.ts, Next.js тянет в
// браузерный бандл весь граф импортов этого файла целиком, включая 'pg' -
// а pg использует Node-модуль 'dns', которого в браузере нет, и сборка
// падает с 500 на первой же загрузке страницы. Именно так это и было
// обнаружено: filters.tsx и page-size-select.tsx - клиентские компоненты,
// которым нужны PAGE_SIZE/PAGE_SIZE_OPTIONS, но не нужен доступ к базе.
// companies.ts ре-экспортирует всё отсюда, так что серверный код
// (page.tsx, tests/companies.test.ts) продолжает импортировать эти же
// имена из '@/lib/companies' без изменений.

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

// Next отдаёт повторяющийся параметр (?city=a&city=b) массивом, а не строкой.
// Без этой нормализации .trim() падает, и пользователь видит сообщение про
// недоступную базу - диагноз, не имеющий отношения к причине.
export const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export interface CompanyPageParams {
  q: string;
  city: string;
  category: string;
  hasSite: boolean;
  sort: SortKey;
  dir: SortDir;
  pageSize: PageSizeOption;
  page: number;
}

// Единственное место, где сырой searchParams превращается в типизированные
// значения страницы - вызывается один раз, наверху CompaniesPage, до любого
// использования параметров. first(...) применён равномерно ко всем полям,
// включая те шесть (hasSite/sort/dir/limit/page), что сегодня не падают на
// массиве только потому, что коэрсятся в булево/число/белый список - если
// завтра здесь появится ещё один параметр со строковым методом, у него уже
// не будет шанса повторить эту же ошибку.
export function parseCompanyPageParams(
  raw: Record<string, string | string[] | undefined>,
): CompanyPageParams {
  const q = first(raw.q).trim();
  const city = first(raw.city).trim();
  const category = first(raw.category).trim();
  const hasSite = first(raw.hasSite) === '1';
  const sort = resolveSortKey(first(raw.sort) || undefined);
  const dir = resolveSortDir(first(raw.dir) || undefined);
  const pageSize = resolvePageSize(first(raw.limit) || undefined);
  const page = Math.max(1, Number.parseInt(first(raw.page) || '1', 10) || 1);
  return { q, city, category, hasSite, sort, dir, pageSize, page };
}

// rating и category допускают NULL (100 компаний без рейтинга, 1 - без
// категории из-за сдвига колонок в review.csv, см. схему). Решение: NULLS
// LAST всегда, независимо от направления. По умолчанию Postgres кладёт NULL
// в конец при ASC, но в
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
export function buildOrderBy(key: SortKey, dir: SortDir): string {
  const { column, nullable } = SORTABLE_COLUMNS[key];
  const direction = SORT_DIRECTION_SQL[dir];
  const nulls = nullable ? ' NULLS LAST' : '';
  return `${column} ${direction}${nulls}, id ASC`;
}
