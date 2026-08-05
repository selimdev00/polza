import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool, getPool } from '../src/lib/db.ts';
import { CODE_DESCRIPTIONS } from '../src/lib/anomaly-codes.ts';

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

// Описание кодов и способ обнаружения - в src/lib/anomaly-codes.ts. ТЗ
// требует явно указать «как обнаружил», поэтому способ хранится рядом с
// кодом; вынесено в общий модуль, потому что тот же текст показывает и
// страница /companies (модалка «Аномалии»).

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
