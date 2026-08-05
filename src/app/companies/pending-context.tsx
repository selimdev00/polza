'use client';

import { createContext, useContext, useTransition, type ReactNode } from 'react';

// Единственный источник isPending/startTransition для всей страницы:
// Filters запускает переход через него, а TableRegion (соседний клиентский
// компонент, обёртывающий серверно отрендеренную таблицу) читает то же
// значение, чтобы приглушить содержимое, пока грузится новая страница
// результатов. Без общего контекста isPending остался бы личным состоянием
// Filters и не был бы виден соседям.
interface PendingContextValue {
  isPending: boolean;
  startTransition: (callback: () => void) => void;
}

const PendingContext = createContext<PendingContextValue | null>(null);

export function PendingProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <PendingContext.Provider value={{ isPending, startTransition }}>
      {children}
    </PendingContext.Provider>
  );
}

export function usePendingFilters(): PendingContextValue {
  const context = useContext(PendingContext);
  if (!context) {
    throw new Error('usePendingFilters must be used within PendingProvider');
  }
  return context;
}
