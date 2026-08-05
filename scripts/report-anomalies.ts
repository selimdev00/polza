import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool, getPool } from '../src/lib/db.ts';

const outputPath = resolve(import.meta.dirname, '../ANOMALIES.md');

// Ручная часть отчёта. Раньше дописывалась в ANOMALIES.md руками поверх
// сгенерированного файла, из-за чего перезапуск скрипта её стирал. Теперь
// это часть самого скрипта, поэтому npm run report:anomalies каждый раз
// выдаёт полный файл целиком, и повторный прогон ничего не теряет.
const GLAVNOE = `## Главное

1. \`review.csv\` - это не отзывы. Схема файла совпадает с выгрузкой компаний
   один в один: те же девять полей. Судя по формулировке ТЗ, это и есть
   "мы что-то перепутали".
2. Шесть строк (\`c_900006\`...\`c_900011\`) - это уже загруженные компании под
   новым пространством id. От своих двойников они отличаются только снятыми
   кавычками в названии; город, адрес, телефон, сайт, рейтинг и число отзывов
   совпадают побайтово. Загрузка с ключом по id пропустила бы их молча и
   раздула базу на шесть фантомных компаний.
3. Два разных сайта в CSV уже принадлежат другим компаниям из базовой
   выгрузки (\`c_001124\` и \`c_000631\` делят \`https://ip-73.ru\`, \`c_001120\` и
   \`c_000025\` делят \`https://ip-445.ru\`). Это не дубли: компании разные.
   Для холодной рассылки, где домен обычно ключ отправки, это ловушка.
4. Отдельно от review.csv: сама постраничная выгрузка компаний по API тоже не
   идеальна - эндпойнт отдаёт шесть компаний дважды на разных страницах
   (одни и те же ext_id встречаются в двух разных json-файлах). Поэтому из
   1000 строк, отданных API, различных компаний 994. Это не значит, что
   \`total: 1000\` у API неверный - как подсчёт строк он честный, ошибка не в
   счётчике, а в том, что часть строк - повторы.
5. Остальное - грязь в значениях: рейтинги вне диапазона и словом,
   отрицательные и дробные счётчики отзывов, моджибейк, сдвиг колонок,
   варианты написания городов, битые телефоны и сайты. Всё перечислено ниже
   с примерами.

Точка \`·\` в таблицах ниже отмечает пробел на границе значения, который иначе
остался бы не виден в отрендеренном markdown.`;

// Человекочитаемое описание для каждого кода и способ, которым аномалия
// была обнаружена. ТЗ требует явно указать «как обнаружил», поэтому
// способ хранится рядом с кодом, а не дописывается руками потом.
const CODE_DESCRIPTIONS: Record<string, { title: string; how: string }> = {
  shadow_duplicate: {
    title: 'Та же компания под новым id',
    how: 'Ключ дедупликации из нормализованных названия, города и адреса совпал с уже загруженной записью - по этому совпадению строка не вставляется, а помечается как слитая. Дополнительно вручную проверено, что у всех шести пар совпадают телефон и сайт: это подтверждает, что ключ поймал реальные дубли, а не случайное совпадение по одной лишь надписи.',
  },
  duplicate_ext_id: {
    title: 'Повторная выгрузка записи с тем же id',
    how: 'Перед вставкой явным SELECT ищем компанию с таким же ext_id; если она уже есть, новую строку не вставляем и помечаем как слитую. UNIQUE-индекс по ext_id в схеме - это подстраховка на случай гонки, а не сам механизм обнаружения.',
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
    how: 'Сначала точное и регистронезависимое сравнение со списком из 20 городов базовой выгрузки, затем таблица латинских алиасов (Moscow, St Petersburg и т.п.), и только потом расстояние Левенштейна до ближайшего города. Порог не фиксирован: он равен min(2, длина названия города / 3), поэтому короткие названия вроде «Уфа» не принимают на себя случайные короткие опечатки, а «Санкт-Петербург» по-прежнему прощает до двух правок.',
  },
  city_unrecognized: {
    title: 'Город не распознан',
    how: 'Значение не совпало ни с одним известным городом даже с учётом отступа по Левенштейну, который зависит от длины названия (не более 2 правок, для коротких городов меньше).',
  },
  rating_out_of_range: {
    title: 'Рейтинг вне диапазона 0..5',
    how: 'Проверка диапазона при разборе. В базовой выгрузке рейтинги лежат в 3.3..5.0, так что и 7.2, и -3 невозможны.',
  },
  rating_unparseable: {
    title: 'Рейтинг не число',
    how: 'Number.isFinite(Number(значение)) вернул false - для нечисловой строки вроде "N/A" это NaN.',
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
    how: 'Number.isFinite(Number(значение)) вернул false - для слова вроде "много" это NaN.',
  },
  phone_invalid: {
    title: 'Телефон не приводится к нормальному виду',
    how: 'После удаления нецифровых символов должно остаться ровно 11 цифр, начинающихся на 7 или 8, а в исходной строке не должно быть букв. Любое из трёх условий не выполняется - телефон недействителен.',
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

// Сколько строк примера показывать на код максимум. Любое урезание сверх
// этого печатается явной строкой под таблицей - см. цикл ниже.
const EXAMPLE_LIMIT = 10;

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

  // Без DISTINCT ON: каждая строка ingest_issues - отдельное событие журнала
  // и заслуживает отдельного места в таблице. DISTINCT ON (code, ext_id)
  // раньше схлопывал events с одинаковым ext_id - для empty_row обе пустые
  // строки несут ext_id '' и превращались в одну. Сортировка по id (порядку
  // вставки в журнал) вместо ext_id/source_row делает порядок стабильным.
  const examples = await pool.query<ExampleRow>(
    `SELECT code, ext_id, source_row, field, raw_value, new_value
     FROM ingest_issues
     WHERE source_file = 'review.csv'
     ORDER BY code, id`,
  );

  const totals = await pool.query<{ total: string; from_csv: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE source = 'review_csv')::text AS from_csv
     FROM companies`,
  );

  const lines: string[] = [];
  lines.push('# Аномалии в review.csv');
  lines.push('');
  lines.push(GLAVNOE);
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
    const relevant = examples.rows.filter((example) => example.code === item.code);
    const shown = relevant.slice(0, EXAMPLE_LIMIT);
    if (shown.length) {
      lines.push('| id | строка | поле | было | стало |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const example of shown) {
        lines.push(
          `| ${escapeCell(example.ext_id)} | ${example.source_row} | ${escapeCell(example.field)} `
          + `| ${escapeCell(example.raw_value)} | ${escapeCell(example.new_value)} |`,
        );
      }
      lines.push('');
      // Урезание должно быть видимым: молчаливый slice() - ровно та причина,
      // по которой сводка и таблица примеров однажды разошлись (9 против 8).
      if (relevant.length > shown.length) {
        lines.push(`Показаны первые ${shown.length} записей из ${relevant.length}.`);
        lines.push('');
      }
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
