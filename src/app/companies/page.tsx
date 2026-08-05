import { Suspense } from 'react';
import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  listCategories,
  listCities,
  parseCompanyPageParams,
} from '@/lib/companies';
import { getAnomalyJournal } from '@/lib/anomalies';
import { AnomaliesModal } from './anomalies-modal';
import { CompanyResults, CompanyResultsSkeleton } from './company-results';
import { Filters } from './filters';
import { PendingProvider } from './pending-context';
import { ThemeToggle } from './theme-toggle';

// Данные читаются прямо в серверном компоненте: строки подключения нет ни в
// одном байте, уезжающем в браузер, и отдельный Route Handler для этого не
// нужен. Страница динамическая, потому что зависит от searchParams.
export const dynamic = 'force-dynamic';

// Лёгкий фолбэк для полосы фильтров - см. комментарий у <Suspense> вокруг
// <Filters> ниже: он существует не потому, что Filters реально чего-то
// ждёт (cities/categories уже готовы к этому моменту), а потому что
// useSearchParams() внутри Filters (и вложенного в него PageSizeSelect)
// формально требует Suspense-предка выше по дереву. На практике этот
// фолбэк не должен показываться вовсе - но раз он существует, пусть
// повторяет реальные размеры контролов, чтобы не дёргать раскладку в
// том редком случае, когда React всё же успеет его отрисовать.
function FiltersRowSkeleton() {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="h-[38px] w-full animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 sm:w-64" />
      <div className="h-[38px] w-full animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 sm:w-56" />
      <div className="h-[38px] w-full animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 sm:w-56" />
      <div className="h-[38px] w-32 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-[38px] w-24 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

export default async function CompaniesPage({
  searchParams,
}: {
  // Next отдаёт этот тип буквально так - { [key]: string | string[] | undefined } -
  // а не Promise<{ q?: string; ... }>: повторный параметр (?city=a&city=b)
  // приходит массивом. Прежняя, "удобная" сигнатура лгала о рантайме - на
  // повторном параметре (params.q ?? '').trim() падало (массив не строка) и
  // пользователь видел error.tsx с диагнозом "база недоступна", не имеющим
  // отношения к причине. parseCompanyPageParams ниже - единственное место,
  // где это сырое значение превращается в типизированные поля страницы.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  // parseCompanyPageParams (src/lib/company-params.ts) - единственное место,
  // где значения из URL превращаются в то, что реально уйдёт в SQL (см.
  // подробный разбор в src/lib/companies.ts). Ничего сырого из rawParams
  // ниже этой строки уже не используется.
  const { q, city, category, hasSite, sort, dir, pageSize, page } =
    parseCompanyPageParams(rawParams);
  const isDefaultSort = sort === DEFAULT_SORT_KEY && dir === DEFAULT_SORT_DIR;

  // Только три быстрых, кэшированных запроса здесь - listCompanies() в этот
  // Promise.all сознательно не входит. cities/categories не зависят от
  // фильтров вовсе (см. listCities/listCategories в companies.ts), а
  // журнал аномалий - это одна лёгкая выборка на всю таблицу ingest_issues
  // (см. getAnomalyJournal), а не на текущую страницу компаний. Единственный
  // запрос, чья цена растёт с объёмом данных и который стоит того, чтобы
  // его ждать отдельно от остальной страницы, - listCompanies(), вызванный
  // внутри CompanyResults (company-results.tsx) под собственным <Suspense>
  // ниже. Раньше все четыре запроса ждались здесь одним Promise.all, а
  // route-level loading.tsx подменял на время ожидания весь сегмент
  // страницы целиком - шапку, полосу фильтров и всё остальное. Из-за этого
  // на первом заходе на /companies поле поиска, выбор города/категории,
  // чекбокс и переключатель размера страницы превращались в серые
  // прямоугольники, хотя ни один из них не ждёт listCompanies() - их
  // значения приходят прямо из URL, а списки городов/категорий для
  // выпадающих меню - из тех же двух быстрых запросов, что и здесь.
  const [cities, categories, journal] = await Promise.all([
    listCities(),
    listCategories(),
    getAnomalyJournal(),
  ]);

  // cities не зависит от фильтров q/city (см. listCities), поэтому пустой
  // список городов однозначно значит: в companies вообще нет строк, а не
  // что фильтр просто ничего не нашёл. Отдельный запрос "сколько всего в
  // таблице" ради этого не нужен - тот же сигнал уже есть в уже загруженных
  // данных. Флаг вычисляется здесь и передаётся в CompanyResults, а не
  // пересчитывается там: cities и так читается в этой функции для Filters.
  const noDataAtAll = cities.length === 0;

  return (
    // Нижний отступ (pb-6) раньше жил прямо здесь и включался/выключался по
    // pageCount (виден ли футер пагинации) - но pageCount известен только
    // после listCompanies(), внутри CompanyResults, а не синхронно в
    // CompaniesPage (см. комментарий выше про то, почему этот запрос сюда
    // не входит). main теперь всегда без pb-6: тот же зазор снизу, когда
    // футера пагинации нет, воспроизводит сам CompanyResults - явным
    // spacer-элементом на своём конце (см. комментарий там). main остаётся
    // единственным местом с px-4/pt-6/sm:px-6 и h-dvh flex-col раскладкой,
    // от которой зависят и шапка (shrink-0), и растягивающаяся область
    // таблицы (flex-1) внутри CompanyResults.
    <main className="mx-auto flex h-dvh max-w-[1600px] flex-col px-4 pt-6 sm:px-6">
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
      <PendingProvider>
        {/*
          Шапка теперь целиком синхронна: заголовок, Аномалии/тема и полоса
          фильтров не зависят ни от чего, что могло бы ждать базу дольше
          доли миллисекунды (cities/categories/journal см. выше) - поэтому
          у неё больше нет счётчика "Показаны X-Y из N" внутри: total
          известен только после listCompanies() и живёт внутри
          CompanyResults вместе с таблицей, которую он же описывает (см.
          комментарий там). Раньше строка счётчика жила здесь же, под
          заголовком, но это привязывало бы шапку к тому самому запросу,
          от которого её и нужно было отвязать.
        */}
        <header className="relative z-30 flex shrink-0 flex-col gap-5 border-b border-neutral-200 bg-white pb-4 dark:border-neutral-800 dark:bg-neutral-950">
          {/*
            justify-between без отдельного правого отступа - правый край
            группы кнопок совпадает с правым краем таблицы и полосы фильтров
            только потому, что у этой строки нет ни своего padding, ни
            max-width: она наследует и то, и другое от <main> (px-4 sm:px-6,
            max-w-[1600px] mx-auto), как и всё остальное содержимое шапки.
            Отрицательный отступ или фиксированное смещение сломались бы на
            любой другой ширине вьюпорта - здесь выравнивание идёт от общей
            геометрии контейнера, а не от подгонки под один размер экрана.
            На узкой ширине, когда AnomaliesModal + ThemeToggle не помещаются
            рядом с заголовком, flex-wrap переносит группу кнопок на вторую
            строку внутри этого же ряда; justify-content: space-between для
            единственного элемента на перенесённой строке - это flex-start
            (браузерное поведение, не частный случай), то есть группа
            прижимается к левому краю, под заголовком, а не повисает у
            правого - так она не отрывается от остального контента шапки,
            которое всё выровнено по левому краю (заголовок, поля фильтров).
          */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Компании</h1>
            <div className="flex items-center gap-3">
              <AnomaliesModal totalCount={journal.totalCount} byCode={journal.byCode} />
              <ThemeToggle />
            </div>
          </div>

          {/*
            Suspense вокруг Filters - не про ожидание данных (cities и
            categories уже здесь, переданы пропами), а про формальное
            требование Next: клиентский компонент, читающий
            useSearchParams() (сам Filters и вложенный в него
            PageSizeSelect), обязан иметь предком Suspense-границу. Раньше
            эту роль неявно играл route-level loading.tsx, оборачивавший
            всю страницу целиком; после его удаления эта граница должна
            быть явной здесь. На реальном рендере фолбэк ниже практически
            никогда не виден - Filters ни на что не переключается.
          */}
          <Suspense fallback={<FiltersRowSkeleton />}>
            <Filters
              cities={cities}
              categories={categories}
              q={q}
              city={city}
              category={category}
              hasSite={hasSite}
              pageSize={pageSize}
              hasActiveSort={!isDefaultSort}
            />
          </Suspense>
        </header>

        {/*
          Единственная граница стриминга на странице, реально завязанная на
          ожидание: CompanyResults вызывает listCompanies() и рендерит
          строку счётчика, таблицу (и её карточный вариант) и футер
          пагинации - см. company-results.tsx. Пока он не готов,
          CompanyResultsSkeleton резервирует ровно те же размеры (включая
          настоящий pageSize из URL, а не константу по умолчанию), так что
          после появления данных ничего не скачет.
        */}
        <Suspense fallback={<CompanyResultsSkeleton pageSize={pageSize} />}>
          <CompanyResults
            q={q}
            city={city}
            category={category}
            hasSite={hasSite}
            sort={sort}
            dir={dir}
            pageSize={pageSize}
            page={page}
            noDataAtAll={noDataAtAll}
            journalByExtId={journal.byExtId}
          />
        </Suspense>
      </PendingProvider>
    </main>
  );
}
