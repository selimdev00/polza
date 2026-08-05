'use client';

// Кастомный чекбокс, оформленный в тон остальным контролам фильтров - как и
// в случае с городом/категорией/размером страницы, нативный <input
// type="checkbox"> красится только цветом акцента браузера и не подчиняется
// теме страницы (в скриншоте это выглядело светлым квадратом в тёмной
// теме). Подход - "настоящий input визуально заменён", а не
// role="checkbox" на <span>: настоящий input даёт Space/клик по подписи и
// участие в потоке формы бесплатно, от браузера, а не переписанными вручную
// обработчиками, которые пришлось бы держать в синхроне с состоянием.
// Сам input не убран из DOM/потока табуляции - он span{opacity:0}, поэтому
// фокус, Space и клик по нему работают ровно как у обычного чекбокса,
// просто рисует его соседний <span aria-hidden> через peer-*.
import type { ReactNode } from 'react';

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 border border-transparent py-2 text-sm text-neutral-600 dark:text-neutral-400">
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 h-4 w-4 cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none flex h-4 w-4 shrink-0 items-center justify-center rounded border border-neutral-300 bg-white transition-colors duration-150 peer-hover:border-neutral-400 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-900 dark:peer-hover:border-neutral-500 dark:peer-checked:border-blue-500 dark:peer-checked:bg-blue-500 dark:peer-focus-visible:ring-offset-neutral-950"
        >
          {checked && (
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              focusable="false"
              className="h-3 w-3 text-white"
            >
              <path
                d="M4 10.5l3.5 3.5L16 5.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </span>
      {children}
    </label>
  );
}
