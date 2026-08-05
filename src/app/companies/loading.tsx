import { PAGE_SIZE } from '@/lib/companies';

// Next.js подставляет этот файл как Suspense-фолбэк на время, пока
// CompaniesPage (async Server Component) ждёт ответа от базы - при первом
// заходе на /companies и при переходах по обычным <a href> (Назад/Вперёд -
// это не next/link, значит полноценная навигация, и стриминг тоже её
// покрывает). Разметка повторяет реальную страницу колонка в колонку и
// строка в строку (PAGE_SIZE), чтобы после загрузки не было скачка высоты.
function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

export default function CompaniesLoading() {
  return (
    <main className="mx-auto flex h-dvh max-w-[1600px] flex-col px-6 py-6">
      <header className="relative z-30 flex shrink-0 flex-wrap justify-between gap-4 border-b border-neutral-200 bg-white pb-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Компании</h1>
          <SkeletonBlock className="mt-2 h-4 w-40" />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SkeletonBlock className="h-[38px] w-64 rounded-md" />
          <SkeletonBlock className="h-[38px] w-56 rounded-md" />
        </div>
      </header>

      <div className="relative z-10 mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[54rem] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Категория</th>
              <th className="px-3 py-2 font-medium">Город</th>
              <th className="px-3 py-2 font-medium">Адрес</th>
              <th className="px-3 py-2 text-right font-medium">Рейтинг</th>
              <th className="px-3 py-2 text-right font-medium">Отзывы</th>
              <th className="px-3 py-2 font-medium">Сайт</th>
              <th className="px-3 py-2 font-medium">Телефон</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PAGE_SIZE }, (_, index) => (
              <tr key={index} className="border-t border-neutral-100 dark:border-neutral-900">
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-36" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-28" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-24" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-40" />
                </td>
                <td className="px-3 py-2 text-right">
                  <SkeletonBlock className="ml-auto h-4 w-8" />
                </td>
                <td className="px-3 py-2 text-right">
                  <SkeletonBlock className="ml-auto h-4 w-8" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-32" />
                </td>
                <td className="px-3 py-2">
                  <SkeletonBlock className="h-4 w-28" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Полоса пагинации показана почти всегда (при 1184 строках и 25 на
        страницу это 48 страниц), поэтому скелет тоже её резервирует -
        иначе после загрузки данных высота страницы дополнительно скакнёт.
      */}
      <div className="relative left-1/2 z-30 mt-4 w-screen -translate-x-1/2 shrink-0 border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2 text-sm">
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-16" />
        </nav>
      </div>
    </main>
  );
}
