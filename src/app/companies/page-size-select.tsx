'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { PAGE_SIZE, PAGE_SIZE_OPTIONS, type PageSizeOption } from '@/lib/company-params';
import { usePendingFilters } from './pending-context';

// Всего три значения (см. PAGE_SIZE_OPTIONS в src/lib/companies.ts) - для
// такого выбора хватает нативного <select>, без кастомного ARIA-listbox,
// как у города/категории: там список открыт и может быть длинным, здесь
// ровно три пункта и role="combobox" был бы избыточен.
export function PageSizeSelect({ pageSize }: { pageSize: PageSizeOption }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { startTransition } = usePendingFilters();

  function onChange(event: ChangeEvent<HTMLSelectElement>): void {
    const next = Number(event.target.value) as PageSizeOption;
    const params = new URLSearchParams(searchParams.toString());
    if (next === PAGE_SIZE) params.delete('limit');
    else params.set('limit', String(next));
    // Смена размера страницы - тот же случай, что смена любого фильтра:
    // текущий номер страницы почти наверняка не существует в новой разбивке.
    params.delete('page');
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname);
    });
  }

  return (
    <label className="flex items-center gap-1.5 text-sm text-neutral-500">
      <span className="hidden sm:inline">На странице</span>
      <select
        value={pageSize}
        onChange={onChange}
        aria-label="Количество строк на странице"
        className="rounded-md border border-neutral-300 bg-white py-2 pl-2 pr-6 text-sm text-neutral-900 outline-none transition-colors duration-150 hover:border-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600"
      >
        {PAGE_SIZE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
