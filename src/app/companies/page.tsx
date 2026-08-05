import { PAGE_SIZE, listCities, listCompanies } from '@/lib/companies';
import { Filters } from './filters';

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

  const [{ rows, total, page: safePage }, cities] = await Promise.all([
    listCompanies({ q, city, page }),
    listCities(),
  ]);

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

  return (
    <main className="mx-auto flex h-dvh max-w-[1600px] flex-col px-6 py-6">
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
      <header className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-neutral-200 bg-white pb-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Компании</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {total > 0
              ? `Показаны ${from}-${to} из ${total}`
              : 'Ничего не найдено'}
          </p>
        </div>

        <Filters cities={cities} q={q} city={city} />
      </header>

      <div className="relative z-10 mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[54rem] border-collapse text-sm">
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-neutral-500">
                  По заданным условиям компаний нет
                </td>
              </tr>
            ) : (
              rows.map((company) => {
                const siteUrl = safeSiteUrl(company.site);
                return (
                  <tr
                    key={company.id}
                    className="border-t border-neutral-100 dark:border-neutral-900"
                  >
                    <td className="px-3 py-2">{company.name}</td>
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
                          className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
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
      </div>

      {pageCount > 1 && (
        // Сама полоса растянута на всю ширину страницы (относительно
        // области просмотра, а не только контейнера страницы), а внутренний
        // <nav> ограничен тем же max-w и отступами, что и main, - поэтому
        // элементы управления не расползаются к краям на широких экранах.
        // relative + left-1/2 + -translate-x-1/2 позиционируют полосу, что
        // заодно даёт ей настоящий z-index из шкалы слоёв выше (z-30).
        <div className="relative left-1/2 z-30 mt-4 w-screen -translate-x-1/2 shrink-0 border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 text-sm">
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
                className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
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
                className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                Вперёд
                <ChevronRightIcon />
              </a>
            )}
          </nav>
        </div>
      )}
    </main>
  );
}
