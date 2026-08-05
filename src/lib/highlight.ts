export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Делит строку на куски вокруг совпадений с запросом.
 *
 * Регулярки здесь намеренно не используются: запрос приходит из адресной
 * строки, и любая незаэкранированная скобка превратила бы его в невалидный
 * шаблон, а точка - в «любой символ». Обычный indexOf в цикле от этого
 * свободен и заодно короче любого экранирования.
 *
 * Сравнение регистронезависимое, как ILIKE в самом запросе: иначе строка
 * нашлась бы, а подсветки в ней не было бы, и это читалось бы как баг.
 */
export function splitHighlight(value: string | null, query: string): HighlightSegment[] {
  if (!value) return [];

  const needle = query.trim();
  if (!needle) return [{ text: value, match: false }];

  const haystackLower = value.toLocaleLowerCase('ru-RU');
  const needleLower = needle.toLocaleLowerCase('ru-RU');

  // toLocaleLowerCase может изменить длину строки (не в русском и не в
  // латинице, но в принципе может). Тогда индексы из haystackLower уже не
  // соответствуют value, и резать по ним нельзя - отдаём строку целиком.
  if (haystackLower.length !== value.length) return [{ text: value, match: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (;;) {
    const found = haystackLower.indexOf(needleLower, cursor);
    if (found === -1) break;
    if (found > cursor) segments.push({ text: value.slice(cursor, found), match: false });
    segments.push({ text: value.slice(found, found + needleLower.length), match: true });
    cursor = found + needleLower.length;
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor), match: false });

  return segments.length ? segments : [{ text: value, match: false }];
}
