import { PAGE_SIZE, listCities, listCompanies } from '@/lib/companies';
import { getAnomalyJournal, type CompanyIssue } from '@/lib/anomalies';
import { AnomaliesModal } from './anomalies-modal';
import { Filters } from './filters';
import { PendingProvider } from './pending-context';
import { RowIssuesMarker } from './row-issues';
import { TableRegion } from './table-region';

// Данные читаются прямо в серверном компоненте: строки подключения нет ни в
// одном байте, уезжающем в браузер, и отдельный Route Handler для этого не
// нужен. Страница динамическая, потому что зависит от searchParams.
export const dynamic = 'force-dynamic';

function formatRating(rating: number | null): string {
  return rating === null ? '-' : rating.toFixed(1);
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

// Схему проверяем ещё раз перед рендером, хотя normalizeSite уже отсекает
// мусор при загрузке. Значение приходит из чужой выгрузки, а href с
// javascript: react сам по себе не блокирует: экранируется текст, а не
// атрибут. Одна проверка на этапе загрузки - единственная точка отказа,
// и любой будущий путь записи в обход загрузчика её обойдёт.
function safeSiteUrl(site: string | null): string | null {
  if (!site) return null;
  return /^https?:\/\//i.test(site) ? site : null;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const city = (params.city ?? '').trim();
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const [{ rows, total, page: safePage }, cities, journal] = await Promise.all([
    listCompanies({ q, city, page }),
    listCities(),
    getAnomalyJournal(),
  ]);

  const noIssues: CompanyIssue[] = [];
  // ingest_issues читается целиком одним запросом (см. getAnomalyJournal) и
  // раскладывается в карту по ext_id - поэтому метка в строке не стоит
  // компании отдельного запроса: и на 25 строк текущей страницы, и на все
  // 1184 компании сразу это по-прежнему один и тот же единственный запрос.
  function issuesFor(extId: string): CompanyIssue[] {
    return journal.byExtId[extId] ?? noIssues;
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Эффективная страница приходит из listCompanies - там она зажата до того,
  // как ушла в offset, так что данные и подпись всегда об одной странице.
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, total);

  function pageHref(target: number): string {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (city) next.set('city', city);
    if (target > 1) next.set('page', String(target));
    const query = next.toString();
    return query ? `/companies?${query}` : '/companies';
  }

  const isEmpty = rows.length === 0;
  // cities не зависит от фильтров q/city (см. listCities), поэтому пустой
  // список городов однозначно значит: в companies вообще нет строк, а не
  // что фильтр просто ничего не нашёл. Отдельный запрос "сколько всего в
  // таблице" ради этого не нужен - тот же сигнал уже есть в уже загруженных
  // данных. Значение общее для табличной и карточной (мобильной) раскладок,
  // поэтому вычисляется один раз здесь, а не в каждой из них отдельно.
  const noDataAtAll = cities.length === 0;
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
    // Нижний отступ (pb-6) навешен на main только когда полосы пагинации нет
    // - тогда таблице всё ещё нужен зазор до низа экрана. Когда полоса есть,
    // этот отступ убирается: иначе к собственному py-2 полосы снизу
    // добавлялся бы ещё и pb-6 main, а сверху, между разделителем и текстом,
    // ничего подобного не добавлялось бы - отступы полосы были бы не равны
    // друг другу. Без pb-6 main нижний зазор равен верхнему (оба - py-2
    // полосы), а собственный отступ страницы снизу берёт на себя сама полоса.
    <main
      className={`mx-auto flex h-dvh max-w-[1600px] flex-col px-4 pt-6 sm:px-6 ${
        pageCount > 1 ? '' : 'pb-6'
      }`}
    >
      {/*
        Порядок слоёв на странице (снизу вверх). z-index работает только у
        позиционированных элементов, поэтому у каждого уровня ниже задан явный
        position, а не только класс z-*:
          z-10 - прокручиваемая область таблицы, включая её липкий thead
                 (thead живёт в собственном локальном контексте и с этой
                 шкалой не конкурирует);
          z-30 - шапка и футer пагинации: всегда поверх содержимого таблицы;
          z-50 - всплывающие меню и модалки, открытые из шапки (список
                 городов сегодня, модалка аномалий позже) - выше всего.
        Раньше у шапки был z-10 при position: static, из-за чего z-index
        браузером игнорировался и липкий thead таблицы перекрывал выпадающий
        список городов. Если понадобится новый слой - продолжайте эту шкалу,
        не вставляйте соседние числа между существующими.
      */}
      {/*
        items-stretch (по умолчанию для flex, поэтому явно не указан) делает
        левый и правый блоки шапки одной высоты - по высоте более высокого,
        левого, с заголовком и счётчиком в две строки. Ряд контролов внутри
        Filters прижат к низу этой общей высоты (items-end внутри самого
        компонента), а не центрирован - иначе он "плавает" между строк текста
        слева. При переносе на узких экранах каждый блок остаётся на своей
        строке и получает свою собственную высоту - выравнивание тут просто
        не участвует, ломаться нечему.
      */}
      <PendingProvider>
      <header className="relative z-30 flex shrink-0 flex-wrap justify-between gap-4 border-b border-neutral-200 bg-white pb-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Компании</h1>
            <AnomaliesModal totalCount={journal.totalCount} byCode={journal.byCode} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {total > 0
              ? `Показаны ${from}-${to} из ${total}`
              : 'Ничего не найдено'}
          </p>
        </div>

        <Filters cities={cities} q={q} city={city} />
      </header>

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
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Категория</th>
              <th className="px-3 py-2 font-medium">Город</th>
              <th className="px-3 py-2 font-medium">Адрес</th>
              <th className="px-3 py-2 text-right font-medium">Рейтинг</th>
              <th className="px-3 py-2 text-right font-medium">Отзывы</th>
              <th className="px-3 py-2 font-medium">Сайт</th>
              <th className="px-3 py-2 font-medium">Телефон</th>
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
                        {company.name}
                        <RowIssuesMarker companyName={company.name} issues={issues} />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {company.category ?? '-'}
                    </td>
                    <td className="px-3 py-2">{company.city}</td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {company.address ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatRating(company.rating)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {company.reviews_count}
                    </td>
                    <td className="px-3 py-2">
                      {siteUrl ? (
                        <a
                          href={siteUrl}
                          rel="noopener noreferrer nofollow"
                          target="_blank"
                          className="text-blue-600 underline underline-offset-2 transition-colors duration-150 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {siteUrl.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{company.phone ?? '-'}</td>
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
                        {company.name}
                        <RowIssuesMarker companyName={company.name} issues={issues} />
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                        {formatRating(company.rating)} · {company.reviews_count}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                      {company.category ?? '-'} · {company.city}
                    </div>
                    {secondaryLine && (
                      <div className="mt-1 text-xs text-neutral-400">{secondaryLine}</div>
                    )}
                    {siteUrl && (
                      <a
                        href={siteUrl}
                        rel="noopener noreferrer nofollow"
                        target="_blank"
                        className="mt-1 inline-block text-xs text-blue-600 underline underline-offset-2 transition-colors duration-150 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        {siteUrl.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </TableRegion>

      {pageCount > 1 && (
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
          <nav className="mx-auto flex max-w-[1600px] items-center justify-between border-t border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800 sm:px-6">
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
            <span className="text-neutral-500">
              Страница {safePage} из {pageCount}
            </span>
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
      )}
      </PendingProvider>
    </main>
  );
}
