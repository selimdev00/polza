'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CitySelect } from './city-select';
import { usePendingFilters } from './pending-context';

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4 text-neutral-400"
    >
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 16l-3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4"
    >
      <path
        d="M5.5 5.5l9 9m0-9l-9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Filters({
  cities,
  q,
  city,
}: {
  cities: string[];
  q: string;
  city: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // isPending/startTransition идут из общего контекста, не из локального
  // useTransition, чтобы TableRegion могла приглушать таблицу тем же самым
  // переходом. Сам debounce/apply ниже не менялся.
  const { isPending, startTransition } = usePendingFilters();
  const [query, setQuery] = useState(q);
  // Сравниваем с последним синхронизированным значением, а не считаем вызовы
  // эффекта: в dev App Router монтирует со Strict Mode, и React вызывает
  // эффект на маунте дважды. Флаг-счётчик ("первый рендер") переключается в
  // false на первом из этих двух вызовов, и второй вызов сам решает, что он
  // уже не первый - debounce всё равно срабатывает и стирает page из URL без
  // единого действия пользователя. Сравнение по значению идемпотентно: пока
  // query равен последнему применённому значению, эффект ничего не делает,
  // сколько бы раз он ни выполнился.
  const lastAppliedQuery = useRef(q);

  function apply(next: { q?: string; city?: string }): void {
    const params = new URLSearchParams(searchParams.toString());

    if (next.q !== undefined) {
      if (next.q) params.set('q', next.q);
      else params.delete('q');
      lastAppliedQuery.current = next.q;
    }
    if (next.city !== undefined) {
      if (next.city) params.set('city', next.city);
      else params.delete('city');
    }
    // Любая смена фильтра возвращает на первую страницу: иначе можно
    // оказаться на 12-й странице результата, где всего две.
    params.delete('page');

    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname);
    });
  }

  useEffect(() => {
    if (query === lastAppliedQuery.current) {
      return;
    }
    const timer = setTimeout(() => {
      lastAppliedQuery.current = query;
      apply({ q: query });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function resetAll(): void {
    setQuery('');
    apply({ q: '', city: '' });
  }

  return (
    // flex-wrap - контролы переносятся на свою строку, когда не помещаются;
    // на телефоне поиск и выбор города сами становятся w-full (см. ниже), так
    // что каждый неизбежно занимает отдельную строку - ряд стекает в столбец
    // без отдельного брейкпоинта на этот случай.
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative w-full sm:w-64">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию"
          aria-label="Поиск по названию"
          className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-8 text-sm outline-none transition-colors duration-150 hover:border-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Очистить поиск"
            className="absolute inset-y-0 right-2 flex items-center text-neutral-400 transition-colors duration-150 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      <CitySelect cities={cities} value={city} onChange={(next) => apply({ city: next })} />

      {(query || city) && (
        // border-transparent + py-2 повторяют формулу высоты инпута и
        // селектора города (border + py-2 + line-height text-sm = 38px), а
        // не задают её числом напрямую - так все три контрола остаются
        // одной высоты, даже если шрифт или border-width когда-то изменятся
        // все разом. Из-за items-end на строке выше одинаковая высота втроём
        // означает ещё и общую вертикальную середину - не только общий низ.
        <button
          type="button"
          onClick={resetAll}
          className="flex items-center gap-1 border border-transparent py-2 text-sm text-neutral-500 underline underline-offset-2 transition-colors duration-150 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          <ClearIcon />
          Сбросить
        </button>
      )}

      {/*
        Рендерим индикатор только пока идёт переход, а не держим его в DOM
        постоянно с opacity-0. Раньше он всегда резервировал ширину в конце
        строки, из-за чего последний видимый контрол (выбор города) не
        дотягивался до правого края шапки/таблицы. aria-live="polite" на
        свежесмонтированном элементе экранные чтецы всё равно озвучивают.
        border-transparent + py-2 - та же формула высоты, что у остальных
        контролов строки, по той же причине.
      */}
      {isPending && (
        <span
          aria-live="polite"
          className="animate-fade-in border border-transparent py-2 text-sm text-neutral-400"
        >
          обновляем
        </span>
      )}
    </div>
  );
}
