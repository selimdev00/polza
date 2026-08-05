'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PAGE_SIZE, PAGE_SIZE_OPTIONS, type PageSizeOption } from '@/lib/company-params';
import { SelectDropdown } from './select-dropdown';
import { usePendingFilters } from './pending-context';

// Раньше это был нативный <select> - у него всего три варианта, и казалось,
// что кастомный ARIA-listbox для них избыточен. На деле нативный <select>
// открывает выпадающий список средствами ОС и не подчиняется теме
// страницы - в тёмной теме получался светлый системный попап поверх тёмного
// интерфейса, тот же баг, из-за которого когда-то появился city-select.tsx.
// SelectDropdown уже решает это (свой попап, свои цвета, своя тема) и всё
// равно работает с тремя вариантами без typeahead-коллизий - переиспользован
// как есть, отдельная реализация ради "только трёх чисел" не оправдана.
export function PageSizeSelect({ pageSize }: { pageSize: PageSizeOption }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { startTransition } = usePendingFilters();

  const options = PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }));

  function onChange(nextValue: string): void {
    const next = Number(nextValue) as PageSizeOption;
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
    <span className="flex items-center gap-1.5 text-sm text-neutral-500">
      <span className="hidden sm:inline">На странице</span>
      <SelectDropdown
        options={options}
        value={String(pageSize)}
        onChange={onChange}
        ariaLabel="Количество строк на странице"
        widthClassName="w-24"
      />
    </span>
  );
}
