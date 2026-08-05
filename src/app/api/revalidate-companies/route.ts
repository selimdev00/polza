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
//   curl -X POST http://localhost:3000/api/revalidate-companies
//
// { expire: 0 } - немедленная инвалидация, а не stale-while-revalidate
// ("max"): здесь это разовое ручное действие разработчика, а не публичный
// трафик, которому стоило бы отдать устаревшую страницу на один запрос
// вперёд. Вызов без второго аргумента в Next 16 работает так же
// (немедленно), но помечен deprecated и пишет предупреждение в консоль -
// поэтому передан явно.
export async function POST() {
  revalidateTag(COMPANIES_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag: COMPANIES_CACHE_TAG });
}
