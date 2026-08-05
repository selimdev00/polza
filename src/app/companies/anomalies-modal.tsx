'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AnomalyCodeGroup } from '@/lib/anomalies';
import { useClosingTransition } from './use-closing-transition';

// Селектор фокусируемых элементов внутри модалки - для ручного focus trap.
// [tabindex]:not([tabindex="-1"]) исключает сам контейнер диалога (у него
// tabIndex=-1, он получает фокус программно при открытии, но не должен
// участвовать в Tab-цикле как отдельная остановка).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" className="h-4 w-4">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" className="h-4 w-4">
      <path
        d="M5.5 5.5l9 9m0-9l-9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Значение и до, и после - результат чужой выгрузки, поэтому может быть
// пустой строкой. Пустую строку и null различаем в подписи: null - поля не
// было (например, для строк, слитых с уже существующей записью, нового
// значения попросту нет), пустая строка - поле было принудительно обнулено.
function formatValue(value: string | null): string {
  if (value === null) return '-';
  if (value === '') return '(пусто)';
  return value;
}

export function AnomaliesModal({
  totalCount,
  byCode,
}: {
  totalCount: number;
  byCode: AnomalyCodeGroup[];
}) {
  const [open, setOpen] = useState(false);
  // mounted - открыта модалка или ещё доигрывает animate-fade-out после
  // закрытия (см. use-closing-transition.ts, тот же паттерн, что у
  // выпадающих списков в select-dropdown.tsx). close() ниже переключает
  // только open - фокус на триггер и разблокировку скролла страницы это не
  // задерживает, они по-прежнему в cleanup эффекта ниже, синхронно.
  const { mounted, closing, onAnimationEnd } = useClosingTransition(open);
  const baseId = useId();
  const headingId = `${baseId}-heading`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function close(): void {
    setOpen(false);
  }

  // Фокус уходит в модалку только после того, как она реально в DOM - в
  // обработчике клика по триггеру ref на диалог ещё указывает на предыдущий
  // рендер. Тот же приём, что и в city-select для списка городов.
  useEffect(() => {
    if (!open) return;

    closeButtonRef.current?.focus();

    // Фон не скроллится, пока модалка открыта - иначе таблица компаний под
    // затемнением продолжала бы прокручиваться колесом мыши или свайпом.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab' || !dialogRef.current) return;

    // Ручной focus trap: без него Tab увёл бы фокус на таблицу компаний под
    // затемнением, а модалка формально осталась бы открытой - для
    // скринридера и клавиатурного пользователя это выглядело бы как
    // сломанный диалог. Список фокусируемых элементов собирается заново на
    // каждый Tab, а не один раз при открытии - состав примеров в модалке не
    // меняется, но это не завязывает логику на то, что он останется
    // неизменным.
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-sm text-neutral-600 transition-colors duration-150 hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-100"
      >
        <InfoIcon />
        Аномалии
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {totalCount}
        </span>
      </button>

      {mounted && (
        // z-50 - тот же слой, что у выпадающего списка городов: "всплывающие
        // меню и модалки" в шкале z-index из page.tsx. Модалка обязана
        // перекрывать и шапку, и полосу пагинации (обе на z-30).
        // pointer-events-none, пока closing - затемнение и сама модалка ещё
        // видны (доигрывают animate-fade-out), но кликнуть по угасающему
        // содержимому уже нельзя, оно не должно оставаться интерактивным.
        <div
          onAnimationEnd={onAnimationEnd}
          className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] sm:p-6 ${
            closing ? 'pointer-events-none animate-fade-out' : 'animate-fade-in'
          }`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="w-full max-w-2xl rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <div>
                <h2 id={headingId} className="text-lg font-semibold tracking-tight">
                  Журнал аномалий загрузки
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Всего записей в ingest_issues: {totalCount}. Каждая строка -
                  это одна починка, слияние, обнуление поля или отброшенная
                  строка, а не мнение - все они получены из реального журнала
                  загрузки.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                aria-label="Закрыть"
                className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <p className="text-xs text-neutral-500">
                Точка «·» на границе значения отмечает пробел, который иначе
                остался бы не виден - именно такой пробел и есть одна из
                подсаженных в данные ошибок (см. «Город в нестандартном
                написании» ниже).
              </p>

              <ul className="mt-4 flex flex-col gap-6">
                {byCode.map((group) => (
                  <li key={`${group.code}-${group.disposition}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="text-sm font-semibold">
                        {group.title}{' '}
                        <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs font-normal text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                          {group.code}
                        </code>
                      </h3>
                      <span className="text-xs text-neutral-500">
                        {group.disposition} · {group.count}{' '}
                        {group.count === 1 ? 'запись' : 'записей'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                      {group.how}
                    </p>

                    {group.examples.length > 0 && (
                      <div className="mt-2 overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                        <table className="w-full min-w-[28rem] border-collapse text-xs">
                          <thead className="bg-neutral-50 text-left dark:bg-neutral-900/60">
                            <tr>
                              <th className="px-2 py-1.5 font-medium">id</th>
                              <th className="px-2 py-1.5 font-medium">строка</th>
                              <th className="px-2 py-1.5 font-medium">поле</th>
                              <th className="px-2 py-1.5 font-medium">было</th>
                              <th className="px-2 py-1.5 font-medium">стало</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.examples.map((example, index) => (
                              <tr
                                key={index}
                                className="border-t border-neutral-100 dark:border-neutral-900"
                              >
                                <td className="px-2 py-1.5 tabular-nums text-neutral-500">
                                  {example.extId ?? '-'}
                                </td>
                                <td className="px-2 py-1.5 tabular-nums text-neutral-500">
                                  {example.sourceFile}:{example.sourceRow}
                                </td>
                                <td className="px-2 py-1.5 text-neutral-500">
                                  {example.field ?? '-'}
                                </td>
                                <td className="px-2 py-1.5">{formatValue(example.rawValue)}</td>
                                <td className="px-2 py-1.5">{formatValue(example.newValue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {group.count > group.examples.length && (
                          <p className="border-t border-neutral-100 px-2 py-1.5 text-xs text-neutral-400 dark:border-neutral-900">
                            Показаны первые {group.examples.length} из {group.count}.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
