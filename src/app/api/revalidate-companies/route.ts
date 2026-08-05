import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { COMPANIES_CACHE_TAG } from '@/lib/cache';

// Ручной сброс межзапросного кэша списка компаний, справочника городов и
// журнала аномалий (см. src/lib/cache.ts, src/lib/companies.ts,
// src/lib/anomalies.ts) - все три читают данные, которые обновляют
// npm run load:companies / npm run load:review. Без этого шага кэш и сам
// обновится не позже чем через COMPANIES_CACHE_REVALIDATE_SECONDS секунд,
// но после перезапуска загрузчика удобнее увидеть свежие данные сразу:
//
//   curl -X POST http://localhost:3000/api/revalidate-companies \
//     -H "x-revalidate-secret: $REVALIDATE_SECRET"
//
// { expire: 0 } - немедленная инвалидация, а не stale-while-revalidate
// ("max"): здесь это разовое ручное действие разработчика, а не публичный
// трафик, которому стоило бы отдать устаревшую страницу на один запрос
// вперёд. Вызов без второго аргумента в Next 16 работает так же
// (немедленно), но помечен deprecated и пишет предупреждение в консоль -
// поэтому передан явно.
//
// Раньше POST не требовал вообще ничего - эндпойнт не читает и не меняет
// данные, но на публичном деплое кто угодно мог бы дёргать его сколько
// угодно раз, заставляя каждый следующий запрос снова идти в Postgres вместо
// кэша. Правило простое: если REVALIDATE_SECRET задан - принимается только
// точное совпадение с заголовком x-revalidate-secret; если не задан - в
// проде эндпойнт отказывает всегда (сброс кэша просто ждёт истечения
// revalidate), а локально (NODE_ENV !== 'production') работает как раньше,
// без секрета - незачем городить его ради localhost.
function isAuthorized(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const provided = request.headers.get('x-revalidate-secret') ?? '';
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  // timingSafeEqual падает на несовпадающей длине буферов вместо false,
  // поэтому длину проверяем отдельно, до сравнения содержимого.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  revalidateTag(COMPANIES_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag: COMPANIES_CACHE_TAG });
}
