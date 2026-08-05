'use client';

import { useEffect, useState } from 'react';

// Тот же ключ, что и в THEME_STORAGE_KEY из layout.tsx - продублирован
// намеренно: блокирующий скрипт там должен остаться самостоятельной
// статической строкой, не зависящей от клиентского бандла, а не наоборот.
const THEME_STORAGE_KEY = 'theme';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" className="h-4 w-4">
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" className="h-4 w-4">
      <path
        d="M16.5 12.3A6.8 6.8 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  // До монтирования на клиенте достоверно неизвестно, что уже решил
  // блокирующий скрипт в layout.tsx (он выполняется до гидратации, в обход
  // React) - поэтому первый рендер здесь всегда "тёмная", то же значение,
  // что было бы и на сервере, и хук ничего не переопределяет до эффекта
  // ниже. Расхождение с реальной темой страницы, если она на самом деле
  // светлая, живёт максимум один кадр после гидратации и касается только
  // подписи и иконки этой кнопки - класс .dark на <html>, а с ним и весь
  // остальной вид страницы, уже выставлен скриптом до какой-либо отрисовки
  // и этим эффектом не трогается.
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

    // Явного выбора ещё не было (localStorage пуст) - тема продолжает
    // следовать за системной, поэтому слушаем live-изменения
    // prefers-color-scheme, а не только читаем её один раз при монтировании.
    // Как только пользователь нажмёт переключатель, toggle() запишет выбор
    // в localStorage, и с этого момента изменения системной темы больше не
    // должны перебивать явный выбор - проверка того же localStorage внутри
    // handleChange актуальна на момент каждого события, а не только на
    // момент подписки.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function handleChange(event: MediaQueryListEvent): void {
      if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      const next: Theme = event.matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    }
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Хранилище недоступно (приватный режим, политики) - тема всё равно
      // переключилась на текущей странице, просто выбор не переживёт
      // перезагрузку. Не повод ронять переключатель исключением.
    }
    setTheme(next);
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-sm text-neutral-600 transition-colors duration-150 hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-100"
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
      {isDark ? 'Тёмная' : 'Светлая'}
    </button>
  );
}
