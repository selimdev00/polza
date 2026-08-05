'use client';

import { useEffect } from 'react';

// error.tsx перехватывает исключения из CompaniesPage - в том числе из
// getPool()/listCompanies при недоступном Postgres или незаданном
// DATABASE_URL. Текст ошибки (error.message/error.stack) намеренно нигде
// не рендерится - в него теоретически может попасть строка подключения или
// путь к файлу, а Next.js в dev-режиме такие сообщения не маскирует.
// В консоль браузера ошибку всё же пишем - это не часть отдаваемого HTML,
// а значит требованию "ничего не палить в браузер" не противоречит.
export default function CompaniesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex h-dvh max-w-[1600px] flex-col items-center justify-center px-6 py-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Не получилось загрузить компании</h1>
      <p className="mt-3 max-w-md text-sm text-neutral-500">
        Похоже, база данных недоступна. Если вы запускаете проект впервые,
        поднимите её командой <code className="rounded bg-neutral-100 px-1 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">docker compose up -d</code>{' '}
        и загрузите данные командой{' '}
        <code className="rounded bg-neutral-100 px-1 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">npm run load:companies</code>{' '}
        - подробности в разделе «Быстрый старт» в README.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md border border-neutral-300 px-4 py-2 text-sm transition-colors duration-150 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
      >
        Повторить
      </button>
    </main>
  );
}
