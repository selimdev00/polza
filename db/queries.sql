-- Запросы к таблице companies. Каждый блок начинается со строки
-- «-- @query <название>», по ней их разбирает scripts/run-queries.ts.

-- @query Топ-5 категорий по числу компаний
-- category допускает NULL (одна строка review.csv потеряла категорию
-- из-за сдвига колонок), поэтому NULL исключаем явно, а не полагаемся
-- на то, что его нет.
SELECT
  category,
  count(*) AS companies
FROM companies
WHERE category IS NOT NULL
GROUP BY category
ORDER BY companies DESC, category ASC
LIMIT 5;

-- @query Средний рейтинг по городам среди компаний с 10+ отзывами
-- Порог по отзывам отсекает шум: компания с одним отзывом на 5.0 иначе
-- утянула бы средний рейтинг города вверх. Компании без рейтинга
-- исключаются, иначе они молча считались бы нулём.
SELECT
  city,
  round(avg(rating), 2) AS avg_rating,
  count(*)              AS companies
FROM companies
WHERE reviews_count >= 10
  AND rating IS NOT NULL
GROUP BY city
ORDER BY avg_rating DESC, city ASC;

-- @query Доля компаний с сайтом по категориям
-- count(site) не считает NULL, поэтому отношение к count(*) и есть доля.
-- Сайты, не прошедшие валидацию, к этому моменту уже обнулены, так что
-- «есть сайт» означает «есть валидный адрес», а не «поле не пустое».
SELECT
  category,
  count(*)                                     AS total,
  count(site)                                  AS with_site,
  round(100.0 * count(site) / count(*), 1)     AS pct_with_site
FROM companies
WHERE category IS NOT NULL
GROUP BY category
ORDER BY pct_with_site DESC, category ASC;
