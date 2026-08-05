'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { usePendingFilters } from './pending-context';

export function PageJump({
  currentPage,
  pageCount,
}: {
  currentPage: number;
  pageCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // startTransition - тот же общий переход, что у Filters (см.
  // pending-context.tsx): переход по вручную набранной странице приглушает
  // TableRegion точно так же, как переход по поиску/городу, а не выглядит
  // как отдельный, не связанный с остальной страницей механизм.
  const { startTransition } = usePendingFilters();

  const [value, setValue] = useState(String(currentPage));
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape отменяет набранное и уводит фокус - но уход фокуса сам по себе
  // должен закоммитить значение (см. onBlur ниже). Без этого флага revert
  // по Escape тут же перезаписывался бы обратно тем же самым, уже
  // отклонённым текстом через onBlur, вызванный тем же inputRef.blur().
  const skipNextCommitRef = useRef(false);

  const baseId = useId();
  const rangeId = `${baseId}-range`;

  // currentPage - источник правды из URL, а не то, что пользователь мог
  // начать печатать. Меняется по любому другому маршруту: клик по
  // Назад/Вперёд (полноценная навигация - страница просто перемонтируется
  // заново с верным значением), смена q/city через Filters (сбрасывает
  // page), кнопка "назад" браузера после клиентского перехода - в каждом
  // из этих случаев локальный ввод обязан отражать актуальную страницу.
  useEffect(() => {
    setValue(String(currentPage));
  }, [currentPage]);

  function navigateTo(page: number): void {
    const params = new URLSearchParams(searchParams.toString());
    if (page > 1) params.set('page', String(page));
    else params.delete('page');
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname);
    });
  }

  function commit(): void {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    const trimmed = value.trim();
    const parsed = Number.parseInt(trimmed, 10);
    // Пустая строка или мусор (после фильтрации в onChange сюда мог бы
    // попасть только результат stripping'а, но пустая строка - валидный
    // промежуточный результат) - откатываемся к текущей странице, а не
    // отправляем NaN дальше.
    if (trimmed === '' || !Number.isFinite(parsed)) {
      setValue(String(currentPage));
      return;
    }
    const clamped = Math.min(Math.max(1, parsed), pageCount);
    if (clamped === currentPage) {
      // Тот же номер (в том числе после лишних нулей вроде "007") - просто
      // нормализуем отображаемый текст, переход не нужен.
      setValue(String(clamped));
      return;
    }
    navigateTo(clamped);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      // Коммит - через уход фокуса (blur), а не отдельным вызовом commit()
      // здесь же: иначе Enter коммитит, а следующий за ним blur коммитит
      // тем же значением повторно - безобидно, но лишний переход. blur -
      // единственная точка коммита, Enter лишь просит её отработать раньше,
      // чем пользователь сам отвёл бы фокус.
      event.preventDefault();
      inputRef.current?.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      skipNextCommitRef.current = true;
      setValue(String(currentPage));
      inputRef.current?.blur();
    }
  }

  return (
    <span className="flex items-center gap-1.5 text-neutral-500">
      <label htmlFor={baseId}>Страница</label>
      <input
        ref={inputRef}
        id={baseId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        value={value}
        aria-describedby={rangeId}
        // Нечисловой ввод отфильтровывается тут же, посимвольно - в input
        // никогда не может оказаться ничего, кроме цифр, поэтому commit()
        // ниже имеет дело только с пустой строкой или валидным числом, а
        // не с произвольным текстом, который нужно было бы отдельно
        // распознавать как мусор.
        onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
        onKeyDown={onKeyDown}
        onBlur={commit}
        className="w-12 rounded-md border border-neutral-300 bg-transparent px-1.5 py-1 text-center tabular-nums text-neutral-900 outline-none transition-colors duration-150 hover:border-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:text-neutral-100 dark:hover:border-neutral-600"
      />
      <span id={rangeId} className="sr-only">
        От 1 до {pageCount}
      </span>
      <span aria-hidden="true">из {pageCount}</span>
    </span>
  );
}
