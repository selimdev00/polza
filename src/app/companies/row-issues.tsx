'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { CompanyIssue } from '@/lib/anomalies';
import { useClosingTransition } from './use-closing-transition';

// Значение и до, и после - результат чужой выгрузки, поэтому может быть
// пустой строкой, а не только null. null - поля не было вовсе (например, у
// слитой строки нового значения попросту нет), пустая строка - поле
// обнулили намеренно. Дублирует ту же функцию в anomalies-modal.tsx: обе
// живут в клиентских компонентах, а общий модуль с этой логикой - только
// src/lib/anomalies.ts, у которого есть серверный импорт getPool/pg, и
// тянуть его в клиентский бандл ради четырёх строк не стоит.
function formatValue(value: string | null): string {
  if (value === null) return '-';
  if (value === '') return '(пусто)';
  return value;
}

function MarkerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" className="h-3.5 w-3.5">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function RowIssuesMarker({
  companyName,
  issues,
}: {
  companyName: string;
  issues: CompanyIssue[];
}) {
  const [open, setOpen] = useState(false);
  // mounted - открыт попап или ещё доигрывает animate-fade-out после
  // закрытия, тот же паттерн, что у выпадающих списков и модалки аномалий
  // (см. use-closing-transition.ts).
  const { mounted, closing, onAnimationEnd } = useClosingTransition(open);
  // Координаты попапа считаются от вьюпорта (position: fixed), а не от
  // ближайшего позиционированного предка (position: absolute). Строка
  // таблицы живёт внутри прокручиваемой области (overflow-auto в
  // table-region.tsx) - абсолютно спозиционированный попап обрезался бы её
  // границей, даже с высоким z-index: overflow клипует независимо от
  // порядка наложения. fixed этому правилу не подчиняется.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const baseId = useId();
  const headingId = `${baseId}-heading`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  function openPopup(): void {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(true);
  }

  function close(): void {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    popupRef.current?.focus();

    function handlePointerDown(event: MouseEvent): void {
      if (
        !popupRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        close();
      }
    }
    // Сохранённые координаты верны только для текущего положения строки на
    // экране - скролл (в том числе внутри таблицы) или resize делают их
    // устаревшими. Пересчитывать на каждое событие скролла незачем: проще
    // закрыть попап, как и любой другой открытый по клику попап на странице.
    function handleScrollOrResize(): void {
      close();
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      triggerRef.current?.focus();
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    // Как и список городов в city-select.tsx - попап не модальный и не
    // зацикливает Tab. Уход фокуса дальше по странице - штатный способ его
    // закрыть, а не что-то, что нужно блокировать.
    if (event.key === 'Tab') {
      close();
    }
  }

  if (issues.length === 0) return null;

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Аномалии по компании «${companyName}»: ${issues.length}`}
        onClick={() => (open ? close() : openPopup())}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-amber-600 transition-colors duration-150 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-950/40"
      >
        <MarkerIcon />
      </button>

      {mounted && position && (
        <div
          ref={popupRef}
          role="dialog"
          aria-labelledby={headingId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onAnimationEnd={onAnimationEnd}
          style={{ top: position.top, left: position.left }}
          // z-50 - тот же слой, что у модалки «Аномалии» и списка городов:
          // всплывающее содержимое стоит выше шапки и футера (z-30) и
          // содержимого таблицы (z-10) по шкале из page.tsx.
          // pointer-events-none, пока closing - угасающий попап уже не
          // должен быть кликабелен (см. тот же приём в anomalies-modal.tsx).
          className={`fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-neutral-200 bg-white p-3 text-sm shadow-lg outline-none dark:border-neutral-700 dark:bg-neutral-900 ${
            closing ? 'pointer-events-none animate-fade-out' : 'animate-fade-in'
          }`}
        >
          <h3 id={headingId} className="text-xs font-semibold text-neutral-500">
            Журнал по компании «{companyName}»
          </h3>
          <ul className="mt-2 flex flex-col gap-3">
            {issues.map((issue, index) => (
              <li key={index} className="border-t border-neutral-100 pt-2 first:border-t-0 first:pt-0 dark:border-neutral-800">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="text-xs font-medium">{issue.title}</span>
                  <span className="text-xs text-neutral-400">{issue.disposition}</span>
                </div>
                {issue.field && (
                  <div className="mt-1 text-xs">
                    <span className="text-neutral-400">{issue.field}: </span>
                    <span>{formatValue(issue.rawValue)}</span>
                    <span className="text-neutral-400"> → </span>
                    <span>{formatValue(issue.newValue)}</span>
                  </div>
                )}
                {issue.detail && (
                  <p className="mt-1 text-xs text-neutral-500">{issue.detail}</p>
                )}
                <p className="mt-1 text-[11px] text-neutral-400">
                  {issue.sourceFile}:{issue.sourceRow}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
