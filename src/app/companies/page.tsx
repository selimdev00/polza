import { PAGE_SIZE, listCities, listCompanies } from '@/lib/companies';
import { Filters } from './filters';

// Данные читаются прямо в серверном компоненте: строки подключения нет ни в
// одном байте, уезжающем в браузер, и отдельный Route Handler для этого не
// нужен. Страница динамическая, потому что зависит от searchParams.
export const dynamic = 'force-dynamic';

function formatRating(rating: number | null): string {
  return rating === null ? '-' : rating.toFixed(1);
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

  const [{ rows, total }, cities] = await Promise.all([
    listCompanies({ q, city, page }),
    listCities(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // page может прийти из чужой или устаревшей ссылки и указывать за пределы
  // результата (например ?page=999999 после того как фильтр сузил выдачу).
  // Не зажать его здесь - значит показать диапазон, где начало больше конца.
  const safePage = Math.min(page, pageCount);
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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Компании</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {total > 0
            ? `Показаны ${from}-${to} из ${total}`
            : 'Ничего не найдено'}
        </p>
      </header>

      <Filters cities={cities} q={q} city={city} />

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[54rem] border-collapse text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
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
        <nav className="mt-4 flex items-center justify-between text-sm">
          <a
            href={pageHref(safePage - 1)}
            aria-disabled={safePage <= 1}
            className={
              safePage <= 1
                ? 'pointer-events-none text-neutral-300 dark:text-neutral-700'
                : 'text-blue-600 hover:underline dark:text-blue-400'
            }
          >
            Назад
          </a>
          <span className="text-neutral-500">
            Страница {safePage} из {pageCount}
          </span>
          <a
            href={pageHref(safePage + 1)}
            aria-disabled={safePage >= pageCount}
            className={
              safePage >= pageCount
                ? 'pointer-events-none text-neutral-300 dark:text-neutral-700'
                : 'text-blue-600 hover:underline dark:text-blue-400'
            }
          >
            Вперёд
          </a>
        </nav>
      )}
    </main>
  );
}
