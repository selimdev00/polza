'use client';

import type { ReactNode } from 'react';
import { usePendingFilters } from './pending-context';

// Тонкая клиентская обёртка вокруг серверно отрендеренной таблицы: сама
// таблица (children) остаётся Server Component, а эта обёртка только читает
// общий isPending, чтобы приглушить содержимое на время перехода - вместо
// того чтобы старые строки выглядели так, будто это и есть актуальные данные.
export function TableRegion({ children }: { children: ReactNode }) {
  const { isPending } = usePendingFilters();

  return (
    <div
      aria-busy={isPending}
      className={`relative z-10 mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-200 transition-opacity duration-150 dark:border-neutral-800 ${
        isPending ? 'opacity-60' : 'opacity-100'
      }`}
    >
      {children}
    </div>
  );
}
