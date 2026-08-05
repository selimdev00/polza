'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

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
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  // Сравниваем с последним синхронизированным значением, а не считаем вызовы
  // эффекта: в dev App Router монтирует со Strict Mode, и React вызывает
  // эффект на маунте дважды. Флаг-счётчик ("первый рендер") переключается в
  // false на первом из этих двух вызовов, и второй вызов сам решает, что он
  // уже не первый — debounce всё равно срабатывает и стирает page из URL без
  // единого действия пользователя. Сравнение по значению идемпотентно: пока
  // query равен последнему применённому значению, эффект ничего не делает,
  // сколько бы раз он ни выполнился.
  const lastAppliedQuery = useRef(q);

  function apply(next: { q?: string; city?: string }): void {
    const params = new URLSearchParams(searchParams.toString());

    if (next.q !== undefined) {
      if (next.q) params.set('q', next.q);
      else params.delete('q');
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Поиск по названию"
        aria-label="Поиск по названию"
        className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      <select
        value={city}
        onChange={(event) => apply({ city: event.target.value })}
        aria-label="Фильтр по городу"
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <option value="">Все города</option>
        {cities.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {(query || city) && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            apply({ q: '', city: '' });
          }}
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Сбросить
        </button>
      )}

      <span
        aria-live="polite"
        className={`text-sm text-neutral-400 ${isPending ? 'opacity-100' : 'opacity-0'}`}
      >
        обновляем
      </span>
    </div>
  );
}
