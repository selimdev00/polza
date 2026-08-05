import { splitHighlight } from '@/lib/highlight';

// dangerouslySetInnerHTML здесь недопустим: и запрос q (приходит из URL),
// и сами данные компании (скрейпленные, чужие) - untrusted. Поэтому строка
// режется на куски через splitHighlight, а каждый кусок react выводит как
// обычный текстовый узел - экранирование делает сам react, инъекции через
// value или query здесь физически негде произойти.
//
// Server Component (без 'use client'): splitHighlight - чистая функция без
// DOM/React, и рендерить подсветку можно прямо на сервере, не утяжеляя
// клиентский бандл ради того, что не требует интерактивности.
export function Highlighted({ value, query }: { value: string | null; query: string }) {
  const segments = splitHighlight(value, query);
  if (!segments.length) return null;

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="rounded-sm bg-amber-200/70 text-inherit dark:bg-amber-400/25"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
