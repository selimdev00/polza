import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  PAGE_SIZE,
  listCompanies,
  type PageSizeOption,
  type SortDir,
  type SortKey,
} from '@/lib/companies';
import type { CompanyIssue } from '@/lib/anomalies';
import { Highlighted } from './highlighted';
import { PageJump } from './page-jump';
import { RowIssuesMarker } from './row-issues';
import { TableRegion } from './table-region';

// Всё, что в этом файле, зависит от listCompanies() - единственного запроса
// на странице, который не кэшируется на уровне "мгновенно" (в отличие от
// listCities/listCategories/getAnomalyJournal, читаемых в page.tsx). Именно
// поэтому эта часть страницы - отдельный async Server Component,
// оборачиваемый в <Suspense> в page.tsx, а не часть самой CompaniesPage:
// шапка и полоса фильтров рендерятся немедленно из уже готовых данных,
// а строка счётчика, таблица (и её карточный вариант) и футер пагинации -
// единственное, что реально ждёт ответа от базы, - стримятся следом.

function StarIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500"
    >
      <path
        d="M10 2.75l2.163 4.383 4.837.702-3.5 3.412.826 4.816L10 13.75l-4.326 2.313.826-4.816-3.5-3.412 4.837-.702L10 2.75z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// null - у компании нет рейтинга (100 записей из 1184) - рендерит только "-", без
// звезды: звезда рядом с прочерком читалась бы как "рейтинг есть, просто
// ноль", а не как "рейтинга нет вовсе" - две разные вещи, которые нельзя
// путать в интерфейсе для агентства, продающего именно данные о компаниях.
function RatingValue({ rating }: { rating: number | null }) {
  if (rating === null) return <>-</>;
  return (
    <span className="inline-flex items-center gap-1">
      {rating.toFixed(1)}
      <StarIcon />
    </span>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4"
    >
      <path
        d="M12.5 5.5L8 10l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4"
    >
      <path
        d="M7.5 5.5L12 10l-4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Стрелка вверх/вниз у заголовка колонки сортировки. Рендерится всегда,
// а не только у активной колонки - иначе появление иконки при клике сдвигало
// бы текст заголовка вбок (ширина ссылки менялась бы между "нет иконки" и
// "есть иконка"). У неактивных колонок она просто невидима (opacity-0), но
// место под неё зарезервировано в любом из трёх состояний (по возрастанию,
// по убыванию, не активна) одинаково.
function SortIcon({ direction, active }: { direction: SortDir; active: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`h-3.5 w-3.5 shrink-0 transition-opacity duration-150 ${active ? 'opacity-100' : 'opacity-0'}`}
    >
      <path
        d={direction === 'asc' ? 'M5.5 12.5L10 8l4.5 4.5' : 'M5.5 7.5L10 12l4.5-4.5'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Схему проверяем ещё раз перед рендером, хотя normalizeSite уже отсекает
// мусор при загрузке. Значение приходит из чужой выгрузки, а href с
// javascript: react сам по себе не блокирует: экранируется текст, а не
// атрибут. Одна проверка на этапе загрузки - единственная точка отказа,
// и любой будущий путь записи в обход загрузчика её обойдёт.
function safeSiteUrl(site: string | null): string | null {
  if (!site) return null;
  return /^https?:\/\//i.test(site) ? site : null;
}

interface CompanyResultsProps {
  q: string;
  city: string;
  category: string;
  hasSite: boolean;
  sort: SortKey;
  dir: SortDir;
  pageSize: PageSizeOption;
  page: number;
  // cities не зависит от фильтров q/city (см. listCities в companies.ts),
  // поэтому пустой список городов однозначно значит: в companies вообще нет
  // строк, а не что фильтр просто ничего не нашёл - см. использование ниже.
  // Флаг, а не сам массив: он уже проверен в page.tsx (там cities и так
  // читается для Filters), передавать сюда весь список ради одного
  // .length === 0 незачем.
  noDataAtAll: boolean;
  // Карта аномалий по ext_id - из getAnomalyJournal(), прочитанного один раз
  // в page.tsx вместе с listCities/listCategories. Отдельного запроса это не
  // стоит: он и так один на весь рендер страницы (React.cache дедуплицирует
  // по значению аргументов, а тут их и вовсе нет), но передать уже готовое
  // значение проще, чем вызывать getAnomalyJournal() второй раз здесь же.
  journalByExtId: Record<string, CompanyIssue[]>;
}

export async function CompanyResults({
  q,
  city,
  category,
  hasSite,
  sort,
  dir,
  pageSize,
  page,
  noDataAtAll,
  journalByExtId,
}: CompanyResultsProps) {
  const { rows, total, page: safePage } = await listCompanies({
    q,
    city,
    category,
    hasSite,
    sort,
    dir,
    pageSize,
    page,
  });

  const noIssues: CompanyIssue[] = [];
  function issuesFor(extId: string): CompanyIssue[] {
    return journalByExtId[extId] ?? noIssues;
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Эффективная страница приходит из listCompanies - там она зажата до того,
  // как ушла в offset, так что данные и подпись всегда об одной странице.
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  // Единая точка сборки ссылок для пагинации и заголовков сортировки: несёт
  // все текущие q/city/category/hasSite/limit дальше без изменений, а
  // page/sort/dir - то, что явно передано в overrides. Опущенные из
  // overrides sort/dir берутся из текущего resolved-состояния (sort/dir выше)
  // - то есть смена страницы не сбрасывает сортировку, а смена сортировки
  // (см. sortHref) явно просит page=1.
  function buildHref(overrides: { page?: number; sort?: SortKey; dir?: SortDir }): string {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (city) next.set('city', city);
    if (category) next.set('category', category);
    if (hasSite) next.set('hasSite', '1');
    if (pageSize !== PAGE_SIZE) next.set('limit', String(pageSize));

    const nextSort = overrides.sort ?? sort;
    const nextDir = overrides.dir ?? dir;
    if (nextSort !== DEFAULT_SORT_KEY || nextDir !== DEFAULT_SORT_DIR) {
      next.set('sort', nextSort);
      next.set('dir', nextDir);
    }

    const target = overrides.page ?? safePage;
    if (target > 1) next.set('page', String(target));

    const query = next.toString();
    return query ? `/companies?${query}` : '/companies';
  }

  function pageHref(target: number): string {
    return buildHref({ page: target });
  }

  // Клик по заголовку колонки идёт по циклу восходящая -> нисходящая ->
  // дефолт (см. описание в задаче). Если колонка ещё не активна - сразу
  // восходящая. Любая смена сортировки сбрасывает на первую страницу -
  // список, отсортированный иначе, скорее всего не имеет отношения к той
  // странице, на которой стоял пользователь.
  function sortHref(key: SortKey): string {
    if (sort !== key) {
      return buildHref({ sort: key, dir: 'asc', page: 1 });
    }
    if (dir === 'asc') {
      return buildHref({ sort: key, dir: 'desc', page: 1 });
    }
    return buildHref({ sort: DEFAULT_SORT_KEY, dir: DEFAULT_SORT_DIR, page: 1 });
  }

  const isEmpty = rows.length === 0;
  const emptyState = noDataAtAll ? (
    <>
      <p className="text-base font-medium text-neutral-700 dark:text-neutral-300">
        Данных ещё нет
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        Похоже, загрузчики ещё не запускались. Выполните{' '}
        <code className="rounded bg-neutral-100 px-1 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          npm run load:companies
        </code>{' '}
        и обновите страницу.
      </p>
    </>
  ) : (
    <>
      <p className="text-base font-medium text-neutral-700 dark:text-neutral-300">
        Ничего не найдено
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        {q && city
          ? `По запросу «${q}» в городе «${city}» компаний нет.`
          : q
            ? `По запросу «${q}» компаний нет.`
            : city
              ? `В городе «${city}» компаний нет.`
              : 'По заданным условиям компаний нет.'}
      </p>
      <a
        href="/companies"
        className="mt-4 inline-block text-sm text-blue-600 underline underline-offset-2 transition-colors duration-150 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        Сбросить фильтры
      </a>
    </>
  );

  return (
    <>
      {/*
        mt-4 - тот же отступ, что у самой TableRegion ниже (табличной
        области) от полосы фильтров, и у полосы пагинации от таблицы: единый
        шаг между крупными блоками страницы. Раньше эта строка жила в шапке,
        сразу под заголовком - но total известен только после listCompanies,
        поэтому она переехала сюда же, в единственный кусок страницы, который
        и так ждёт этот запрос, а не остался в шапке отдельной точкой ожидания.
      */}
      <p className="mt-4 text-sm text-neutral-500">
        {total > 0 ? `Показаны ${from}-${to} из ${total}` : 'Ничего не найдено'}
      </p>

      <TableRegion>
        {/*
          Восемь колонок таблицы на телефоне не сжать без горизонтальной
          прокрутки, а листать список компаний вбок пальцем неудобнее, чем
          вертикально. Поэтому ниже sm (640px) таблица (display: none)
          заменяется карточным списком - тем же rows, но каждая компания
          в одной карточке из подписанных полей, а не строкой из восьми
          колонок. Название, категория и город остаются на виду всегда;
          адрес и телефон - в отдельной, менее заметной строке карточки,
          и вовсе не рендерятся, если оба поля пустые.
        */}
        <table className="hidden w-full min-w-[54rem] border-collapse text-sm sm:table">
          <thead className="sticky top-0 z-10 bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              {(
                [
                  { key: 'name' as const, label: 'Название' },
                  { key: 'category' as const, label: 'Категория' },
                  { key: 'city' as const, label: 'Город' },
                  { key: null, label: 'Адрес' },
                  // Рейтинг и Отзывы раньше были прижаты к правому краю (как
                  // числовые колонки часто оформляют) - по просьбе выровнены
                  // по левому краю вместе со всеми остальными. tabular-nums
                  // в ячейках ниже (не здесь, в теле таблицы) по-прежнему
                  // держит цифры в одну колонку разрядов, так что при левом
                  // выравнивании они не выглядят рваными.
                  { key: 'rating' as const, label: 'Рейтинг' },
                  { key: 'reviews_count' as const, label: 'Отзывы' },
                  { key: null, label: 'Сайт' },
                  { key: null, label: 'Телефон' },
                ] as const
              ).map((col) => {
                if (col.key === null) {
                  // Адрес/Сайт/Телефон не сортируются.
                  return (
                    <th key={col.label} className="px-3 py-2 font-medium">
                      {col.label}
                    </th>
                  );
                }
                const isActive = sort === col.key;
                return (
                  <th
                    key={col.label}
                    aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="px-3 py-2 font-medium"
                  >
                    <a
                      href={sortHref(col.key)}
                      className={`inline-flex items-center gap-1 transition-colors duration-150 hover:text-neutral-900 dark:hover:text-neutral-100 ${
                        isActive ? '' : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {col.label}
                      <SortIcon direction={dir} active={isActive} />
                    </a>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center">
                  {emptyState}
                </td>
              </tr>
            ) : (
              rows.map((company) => {
                const siteUrl = safeSiteUrl(company.site);
                const issues = issuesFor(company.ext_id);
                return (
                  <tr
                    key={company.id}
                    className="border-t border-neutral-100 transition-colors duration-150 hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/60"
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Highlighted value={company.name} query={q} />
                        <RowIssuesMarker companyName={company.name} issues={issues} />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {company.category ? (
                        <Highlighted value={company.category} query={q} />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Highlighted value={company.city} query={q} />
                    </td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {company.address ? (
                        <Highlighted value={company.address} query={q} />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <RatingValue rating={company.rating} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">{company.reviews_count}</td>
                    <td className="px-3 py-2">
                      {siteUrl ? (
                        <a
                          href={siteUrl}
                          rel="noopener noreferrer nofollow"
                          target="_blank"
                          className="text-blue-600 underline underline-offset-2 transition-colors duration-150 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Highlighted value={siteUrl.replace(/^https?:\/\//, '')} query={q} />
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {company.phone ? <Highlighted value={company.phone} query={q} /> : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="sm:hidden">
          {isEmpty ? (
            <div className="px-3 py-16 text-center">{emptyState}</div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {rows.map((company) => {
                const siteUrl = safeSiteUrl(company.site);
                const issues = issuesFor(company.ext_id);
                const secondaryLine = [company.address, company.phone]
                  .filter((value): value is string => Boolean(value))
                  .join(' · ');
                return (
                  <li key={company.id} className="px-3 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Highlighted value={company.name} query={q} />
                        <RowIssuesMarker companyName={company.name} issues={issues} />
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-neutral-500">
                        <RatingValue rating={company.rating} />
                        <span>· {company.reviews_count}</span>
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                      {company.category ? (
                        <Highlighted value={company.category} query={q} />
                      ) : (
                        '-'
                      )}{' '}
                      · <Highlighted value={company.city} query={q} />
                    </div>
                    {secondaryLine && (
                      <div className="mt-1 text-xs text-neutral-400">
                        <Highlighted value={secondaryLine} query={q} />
                      </div>
                    )}
                    {siteUrl && (
                      <a
                        href={siteUrl}
                        rel="noopener noreferrer nofollow"
                        target="_blank"
                        className="mt-1 inline-block text-xs text-blue-600 underline underline-offset-2 transition-colors duration-150 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <Highlighted value={siteUrl.replace(/^https?:\/\//, '')} query={q} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </TableRegion>

      {pageCount > 1 ? (
        // Сама полоса растянута на всю ширину страницы (относительно
        // области просмотра, а не только контейнера страницы) - это остаётся:
        // фон должен доходить до краёв экрана, чтобы строки таблицы не
        // просвечивали под полосой при resize/bounce-скролле на мобильных.
        // А вот верхняя граница (разделитель) раньше была на этом же
        // растянутом на весь экран элементе - из-за этого линия шла от края
        // до края вьюпорта, а не совпадала с краями контейнера, как у
        // таблицы. Теперь граница переехала на сам <nav>, у которого тот же
        // max-w и центрирование, что у main, - поэтому её концы совпадают с
        // левым и правым краем таблицы на любой ширине экрана, а не зависят
        // от жёсткого значения ширины. relative + left-1/2 + -translate-x-1/2
        // позиционируют полосу, что заодно даёт ей настоящий z-index из шкалы
        // слоёв выше (z-30).
        <div className="relative left-1/2 z-30 mt-4 w-screen -translate-x-1/2 shrink-0 bg-white dark:bg-neutral-950">
          {/*
            min-h-[var(--footer-bar-height)] - раньше эта переменная называлась
            --chrome-bar-height и держала шапку и полосу пагинации одной
            высоты. Шапка теперь всегда трёхстрочная (см. комментарий у
            <header> выше) и всегда выше этого значения - совпадение высот
            перестало быть осмысленным, и переменная переименована, чтобы имя
            не обещало то, чего больше нет: это просто минимальная высота
            самой полосы пагинации, ни на что больше не завязанная.
            Содержимое полосы (одна строка "Назад / Страница X из Y /
            Вперёд") короче этого значения, поэтому именно здесь min-height
            добавляет пространство; items-center распределяет разницу
            поровну сверху и снизу поверх py-2, так что отступ остаётся
            визуально симметричным, а не смещается в одну сторону. См.
            комментарий у --footer-bar-height в globals.css.
          */}
          <nav className="mx-auto flex min-h-[var(--footer-bar-height)] max-w-[1600px] items-center justify-between border-t border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800 sm:px-6">
            {safePage <= 1 ? (
              // aria-disabled на ссылке не мешает Enter/Space активировать её
              // с клавиатуры - pointer-events-none блокирует только мышь.
              // Поэтому в отключённом состоянии это не ссылка, а span: у неё
              // нет href и она не получает фокус вовсе.
              <span
                aria-disabled="true"
                className="flex items-center gap-1 text-neutral-300 dark:text-neutral-700"
              >
                <ChevronLeftIcon />
                Назад
              </span>
            ) : (
              <a
                href={pageHref(safePage - 1)}
                className="flex items-center gap-1 text-blue-600 transition-colors duration-150 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ChevronLeftIcon />
                Назад
              </a>
            )}
            <PageJump currentPage={safePage} pageCount={pageCount} />
            {safePage >= pageCount ? (
              <span
                aria-disabled="true"
                className="flex items-center gap-1 text-neutral-300 dark:text-neutral-700"
              >
                Вперёд
                <ChevronRightIcon />
              </span>
            ) : (
              <a
                href={pageHref(safePage + 1)}
                className="flex items-center gap-1 text-blue-600 transition-colors duration-150 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                Вперёд
                <ChevronRightIcon />
              </a>
            )}
          </nav>
        </div>
      ) : (
        // Без полосы пагинации (одна страница результатов) main остался без
        // pb-6 (см. page.tsx) - раньше этот же зазор снизу main получал
        // условно, по тому же pageCount > 1, которого сама CompaniesPage
        // сейчас не вычисляет. h-6 - то же значение, что было у pb-6
        // (1.5rem), просто перенесённое из padding родителя в отдельный
        // flex-элемент здесь: TableRegion выше - flex-1 внутри
        // h-dvh-колонки main, поэтому этот spacer, а не сам TableRegion,
        // забирает те же 24px снизу, и высота страницы не скачет.
        <div className="h-6 shrink-0" aria-hidden="true" />
      )}
    </>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 ${className}`} />
  );
}

// Фолбэк <Suspense> вокруг CompanyResults в page.tsx. В отличие от прежнего
// route-level loading.tsx, этот компонент рендерится внутри уже готовой
// шапки и полосы фильтров (они не часть фолбэка вовсе - см. page.tsx), и
// знает настоящий pageSize из URL (page.tsx уже распарсил searchParams до
// того, как решить, сколько строк-заглушек рисовать) - раньше loading.tsx
// не имел доступа к searchParams и всегда резервировал ровно PAGE_SIZE (25)
// строк, даже когда пользователь выбрал 50 или 100 на странице.
export function CompanyResultsSkeleton({ pageSize }: { pageSize: PageSizeOption }) {
  return (
    <>
      <SkeletonBlock className="mt-4 h-4 w-40" />

      <div className="relative z-10 mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        {/*
          hidden/sm:table ниже повторяет разбивку из company-results.tsx:
          таблица видна только от sm (640px) и выше, а до sm её заменяет
          карточный список. Раньше в старом route-level loading.tsx здесь не
          было hidden вовсе - скелетон ниже sm показывал восьмиколоночную
          десктопную таблицу, а после загрузки страница подменяла её
          карточным списком - ровно тот скачок раскладки, которого этот
          файл существует, чтобы избежать.
        */}
        <table className="hidden w-full min-w-[54rem] border-collapse text-sm sm:table">
          <thead className="sticky top-0 z-10 bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Категория</th>
              <th className="px-3 py-2 font-medium">Город</th>
              <th className="px-3 py-2 font-medium">Адрес</th>
              <th className="px-3 py-2 font-medium">Рейтинг</th>
              <th className="px-3 py-2 font-medium">Отзывы</th>
              <th className="px-3 py-2 font-medium">Сайт</th>
              <th className="px-3 py-2 font-medium">Телефон</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: pageSize }, (_, index) => (
              <tr key={index} className="border-t border-neutral-100 dark:border-neutral-900">
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-36" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-28" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-24" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-40" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-8" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-8" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-32" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-28" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          Карточный скелетон ниже sm - зеркалит структуру карточки в
          company-results.tsx (имя+рейтинг в одной строке, категория/город
          строкой ниже, необязательная строка адреса/телефона), не восемь
          колонок таблицы выше.
        */}
        <div className="sm:hidden">
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {Array.from({ length: pageSize }, (_, index) => (
              <li key={index} className="px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <SkeletonBlock className="h-4 w-36" />
                  <SkeletonBlock className="h-3 w-14" />
                </div>
                <SkeletonBlock className="mt-1.5 h-3.5 w-40" />
                <SkeletonBlock className="mt-1.5 h-3 w-32" />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/*
        Полоса пагинации показана почти всегда (при 1184 строках и 25 на
        страницу это 48 страниц), поэтому скелет тоже её резервирует - иначе
        после загрузки данных высота страницы дополнительно скакнёт. Не
        зависит от pageCount (в отличие от реальной полосы, которая прячется
        при pageCount === 1): к моменту, когда pageCount станет известен,
        фолбэк уже заменён настоящим содержимым.
      */}
      <div className="relative left-1/2 z-30 mt-4 w-screen -translate-x-1/2 shrink-0 bg-white dark:bg-neutral-950">
        <nav className="mx-auto flex min-h-[var(--footer-bar-height)] max-w-[1600px] items-center justify-between border-t border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800 sm:px-6">
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-16" />
        </nav>
      </div>
    </>
  );
}
