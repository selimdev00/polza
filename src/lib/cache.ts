// Общие настройки межзапросного кэша для чтений companies.ts/anomalies.ts.
// Оба источника (таблицы companies и ingest_issues) наполняются одними и
// теми же загрузчиками (npm run load:companies, npm run load:review) и
// меняются только когда те перезапускают вручную - поэтому делят один тег:
// сбросить оба разом можно одним вызовом revalidateTag(COMPANIES_CACHE_TAG),
// см. src/app/api/revalidate-companies/route.ts и README.
export const COMPANIES_CACHE_TAG = 'companies';

// Данные не "устаревают" сами по себе - они меняются только ручным
// перезапуском загрузчика, у которого есть свой явный способ сбросить кэш
// (POST /api/revalidate-companies). Поэтому 5 минут здесь - не оценка того,
// как быстро данные протухают, а просто разумный потолок: сколько запросов
// к Postgres снимает окно при обычном пролистывании страниц/фильтров, пока
// оставаясь достаточно коротким, чтобы забытый вызов revalidate не был
// заметен дольше нескольких минут даже без него.
export const COMPANIES_CACHE_REVALIDATE_SECONDS = 300;
