import Link from 'next/link';

// Общий 404 для всего приложения (маршрутов, кроме / и /companies, тут нет).
export default function NotFound() {
  return (
    <main className="mx-auto flex h-dvh max-w-[1600px] flex-col items-center justify-center px-6 py-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Страница не найдена</h1>
      <p className="mt-3 max-w-md text-sm text-neutral-500">
        Такого адреса нет. Возможно, ссылка устарела или в ней опечатка.
      </p>
      <Link
        href="/companies"
        className="mt-6 rounded-md border border-neutral-300 px-4 py-2 text-sm text-blue-600 transition-colors duration-150 hover:border-neutral-400 dark:border-neutral-700 dark:text-blue-400 dark:hover:border-neutral-600"
      >
        К списку компаний
      </Link>
    </main>
  );
}
