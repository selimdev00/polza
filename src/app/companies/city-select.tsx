'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

const ALL_CITIES_LABEL = 'Все города';

// Сколько мс ждём после последней буквы, прежде чем сбросить typeahead.
// Названия городов различаются уже по первой букве, копить строку незачем.
const TYPEAHEAD_RESET_MS = 600;

export function CitySelect({
  cities,
  value,
  onChange,
}: {
  cities: string[];
  value: string;
  onChange: (city: string) => void;
}) {
  const baseId = useId();
  const listId = `${baseId}-listbox`;

  const options: Option[] = [
    { value: '', label: ALL_CITIES_LABEL },
    ...cities.map((city) => ({ value: city, label: city })),
  ];

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Список остаётся в DOM ещё немного после close(), чтобы доиграть
  // анимацию исчезновения (см. animate-dropdown-out в globals.css и
  // onAnimationEnd на <ul> ниже) - без этого закрытие было бы мгновенным.
  const [closing, setClosing] = useState(false);
  const wasOpenRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const typeaheadRef = useRef<{ char: string; timer: ReturnType<typeof setTimeout> | null }>({
    char: '',
    timer: null,
  });

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : ALL_CITIES_LABEL;

  function openList(): void {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function closeList(): void {
    setOpen(false);
  }

  function selectOption(option: Option): void {
    onChange(option.value);
    closeList();
    triggerRef.current?.focus();
  }

  // Фокус переносим в список именно после того, как он реально попал в DOM,
  // а не в обработчике клика/клавиши - там ref ещё указывает на предыдущий
  // рендер, где списка не было.
  useEffect(() => {
    if (open) {
      listRef.current?.focus();
    }
  }, [open]);

  // wasOpenRef различает "уже был открыт и закрылся" (нужна анимация выхода)
  // от "изначально закрыт" (мигать нечем на самом первом рендере).
  useEffect(() => {
    if (open) {
      setClosing(false);
    } else if (wasOpenRef.current) {
      setClosing(true);
    }
    wasOpenRef.current = open;
  }, [open]);

  const showList = open || closing;

  // Активная опция должна быть видна, даже если список выше своего
  // содержимого и появилась полоса прокрутки.
  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  // Клик вне триггера и списка закрывает попап, но не меняет выбор.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeList();
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function handleTypeahead(key: string): void {
    if (key.length !== 1) return;
    const char = key.toLowerCase();

    if (typeaheadRef.current.timer) clearTimeout(typeaheadRef.current.timer);
    typeaheadRef.current.char = char;
    typeaheadRef.current.timer = setTimeout(() => {
      typeaheadRef.current.char = '';
    }, TYPEAHEAD_RESET_MS);

    for (let step = 1; step <= options.length; step += 1) {
      const index = (activeIndex + step) % options.length;
      if (options[index].label.toLowerCase().startsWith(char)) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    switch (event.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        openList();
        break;
      default:
        break;
    }
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + options.length) % options.length);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectOption(options[activeIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        closeList();
        triggerRef.current?.focus();
        break;
      case 'Tab':
        closeList();
        break;
      default:
        handleTypeahead(event.key);
        break;
    }
  }

  const activeId = open ? `${baseId}-option-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative w-full text-sm sm:w-56">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Фильтр по городу"
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onTriggerKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-neutral-300 px-3 py-2 text-left outline-none transition-colors duration-150 hover:border-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M5.5 7.5L10 12l4.5-4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {showList && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Фильтр по городу"
          aria-activedescendant={activeId}
          onKeyDown={onListKeyDown}
          onAnimationEnd={() => {
            if (!open) setClosing(false);
          }}
          className={`absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-neutral-300 bg-white py-1 shadow-lg outline-none dark:border-neutral-700 dark:bg-neutral-900 ${
            open ? 'animate-dropdown-in' : 'pointer-events-none animate-dropdown-out'
          }`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            // isActive - клавиатурная навигация (стрелки/Home/End/typeahead).
            // Наведение мышью стилизуется отдельно, чистым CSS :hover ниже,
            // и больше не двигает activeIndex - иначе клавиатурный
            // пользователь терял бы место при случайном наведении курсора.
            const isActive = index === activeIndex;
            const stateClassName = isActive
              ? 'bg-neutral-200 ring-1 ring-inset ring-neutral-400 dark:bg-neutral-700 dark:ring-neutral-500'
              : isSelected
                ? 'bg-blue-50 dark:bg-blue-950/40'
                : '';
            return (
              <li
                key={option.value || '__all__'}
                id={`${baseId}-option-${index}`}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(option)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors duration-150 hover:bg-neutral-100 dark:hover:bg-neutral-800/70 ${stateClassName}`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {isSelected && (
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                      focusable="false"
                      className="h-3.5 w-3.5"
                    >
                      <path
                        d="M4 10.5l3.5 3.5L16 5.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="truncate">{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
