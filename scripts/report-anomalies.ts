import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool, getPool } from '../src/lib/db.ts';

const outputPath = resolve(import.meta.dirname, '../ANOMALIES.md');

// Человекочитаемое описание для каждого кода и способ, которым аномалия
// была обнаружена. ТЗ требует явно указать «как обнаружил», поэтому
// способ хранится рядом с кодом, а не дописывается руками потом.
const CODE_DESCRIPTIONS: Record<string, { title: string; how: string }> = {
  shadow_duplicate: {
    title: 'Та же компания под новым id',
    how: 'Ключ дедупликации из нормализованных названия, города и адреса совпал с уже загруженной записью. Совпадение по телефону и сайту подтвердило, что это одна и та же организация.',
  },
  duplicate_ext_id: {
    title: 'Повторная выгрузка записи с тем же id',
    how: 'UNIQUE-индекс по ext_id: вторая и последующие строки с тем же id не вставляются, а помечаются как слитые.',
  },
  empty_row: {
    title: 'Полностью пустая строка',
    how: 'Все девять полей после trim оказались пустыми.',
  },
  mojibake_repaired: {
    title: 'Текст, прочитанный как cp1251 вместо utf-8',
    how: 'Строка закодирована обратно в cp1251 и декодирована как utf-8 в строгом режиме. Успешное декодирование с кириллицей на выходе означает, что это моджибейк, а не обычный текст.',
  },
  column_shift_repaired: {
    title: 'Сдвиг колонок на одну влево',
    how: 'В поле category лежало название города, в city - адрес, а address был пуст. Все три условия одновременно в корректной строке не встречаются.',
  },
  city_canonicalized: {
    title: 'Город в нестандартном написании',
    how: 'Точного совпадения со списком из 20 городов базовой выгрузки не нашлось. Сопоставление по регистру, по латинскому алиасу и по расстоянию Левенштейна с порогом 2.',
  },
  city_unrecognized: {
    title: 'Город не распознан',
    how: 'Значение не совпало ни с одним известным городом даже с допуском в две правки.',
  },
  rating_out_of_range: {
    title: 'Рейтинг вне диапазона 0..5',
    how: 'Проверка диапазона при разборе. В базовой выгрузке рейтинги лежат в 3.3..5.0, так что и 7.2, и -3 невозможны.',
  },
  rating_unparseable: {
    title: 'Рейтинг не число',
    how: 'Number() вернул NaN.',
  },
  rating_comma_decimal: {
    title: 'Десятичная запятая в рейтинге',
    how: 'В значении найдена запятая - след выгрузки в русской локали. Заменена на точку.',
  },
  reviews_negative: {
    title: 'Отрицательное число отзывов',
    how: 'Проверка знака при разборе.',
  },
  reviews_fractional: {
    title: 'Дробное число отзывов',
    how: 'Number.isInteger() вернул false.',
  },
  reviews_unparseable: {
    title: 'Число отзывов словом',
    how: 'Number() вернул NaN.',
  },
  phone_invalid: {
    title: 'Телефон не приводится к нормальному виду',
    how: 'После удаления нецифровых символов осталось не 11 цифр, либо в исходной строке были буквы.',
  },
  site_invalid: {
    title: 'Сайт не является адресом',
    how: 'Строка не прошла проверку «схема + домен хотя бы с одной точкой».',
  },
  site_scheme_typo: {
    title: 'Опечатка в схеме адреса',
    how: 'Схема похожа на http/https, но записана неверно. Исправлена.',
  },
  missing_identity: {
    title: 'Нет id или названия',
    how: 'Обязательные поля пусты, строку невозможно идентифицировать.',
  },
};

interface CodeRow { code: string; disposition: string; count: string }
interface ExampleRow {
  code: string; ext_id: string | null; source_row: number;
  field: string | null; raw_value: string | null; new_value: string | null;
}

function escapeCell(value: string | null): string {
  if (value === null) return '';
  const escaped = value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  // Пробел на границе значения не виден в отрендеренном markdown - HTML
  // схлопывает крайние пробелы в ячейке таблицы. Именно такой пробел
  // оказался реальной ошибкой данных (см. city_canonicalized, c_001184),
  // поэтому делаем его видимым простым маркером вместо того, чтобы
  // молча его потерять.
  return escaped.replace(/^ /, '·').replace(/ $/, '·');
}

async function main(): Promise<void> {
  const pool = getPool();

  const summary = await pool.query<CodeRow>(
    `SELECT code, disposition, count(*)::text AS count
     FROM ingest_issues
     WHERE source_file = 'review.csv'
     GROUP BY code, disposition
     ORDER BY count(*) DESC, code ASC`,
  );

  const examples = await pool.query<ExampleRow>(
    `SELECT DISTINCT ON (code, ext_id)
            code, ext_id, source_row, field, raw_value, new_value
     FROM ingest_issues
     WHERE source_file = 'review.csv'
     ORDER BY code, ext_id, source_row
     LIMIT 200`,
  );

  const totals = await pool.query<{ total: string; from_csv: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE source = 'review_csv')::text AS from_csv
     FROM companies`,
  );

  const lines: string[] = [];
  lines.push('# Аномалии в review.csv');
  lines.push('');
  lines.push('Файл сгенерирован скриптом `npm run report:anomalies` из таблицы');
  lines.push('`ingest_issues`, то есть из реального журнала загрузки, а не написан руками.');
  lines.push('Каждая строка загрузки, которая была починена, слита или отброшена,');
  lines.push('оставляет запись в этой таблице, поэтому ничего не теряется молча.');
  lines.push('');
  lines.push(`Всего компаний в базе после обеих загрузок: ${totals.rows[0].total}, `
    + `из них добавлено из review.csv: ${totals.rows[0].from_csv}.`);
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push('| Код | Что это | Действие | Строк |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of summary.rows) {
    const meta = CODE_DESCRIPTIONS[item.code];
    lines.push(`| \`${item.code}\` | ${meta?.title ?? ''} | ${item.disposition} | ${item.count} |`);
  }

  lines.push('');
  lines.push('## Как обнаружено, по каждому виду');
  lines.push('');
  for (const item of summary.rows) {
    const meta = CODE_DESCRIPTIONS[item.code];
    if (!meta) continue;
    lines.push(`### ${meta.title} (\`${item.code}\`)`);
    lines.push('');
    lines.push(meta.how);
    lines.push('');
    const relevant = examples.rows.filter((example) => example.code === item.code).slice(0, 8);
    if (relevant.length) {
      lines.push('| id | строка | поле | было | стало |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const example of relevant) {
        lines.push(
          `| ${escapeCell(example.ext_id)} | ${example.source_row} | ${escapeCell(example.field)} `
          + `| ${escapeCell(example.raw_value)} | ${escapeCell(example.new_value)} |`,
        );
      }
      lines.push('');
    }
  }

  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log('Записан', outputPath);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
