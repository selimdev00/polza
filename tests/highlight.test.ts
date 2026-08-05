import { describe, expect, it } from 'vitest';
import { splitHighlight } from '../src/lib/highlight.ts';

const joined = (value: string, query: string) =>
  splitHighlight(value, query).map((part) => part.text).join('');

describe('splitHighlight', () => {
  it('без совпадения возвращает строку одним куском', () => {
    expect(splitHighlight('ООО «Сфера»', 'банк')).toEqual([
      { text: 'ООО «Сфера»', match: false },
    ]);
  });

  it('находит совпадение в середине', () => {
    expect(splitHighlight('ООО «Сфера»', 'Сфера')).toEqual([
      { text: 'ООО «', match: false },
      { text: 'Сфера', match: true },
      { text: '»', match: false },
    ]);
  });

  it('находит несколько совпадений, а не только первое', () => {
    expect(splitHighlight('Сфера и ещё Сфера', 'Сфера')).toEqual([
      { text: 'Сфера', match: true },
      { text: ' и ещё ', match: false },
      { text: 'Сфера', match: true },
    ]);
  });

  it('регистр не важен, как и в ILIKE', () => {
    expect(splitHighlight('ООО «Сфера»', 'сфера')).toEqual([
      { text: 'ООО «', match: false },
      { text: 'Сфера', match: true },
      { text: '»', match: false },
    ]);
    expect(splitHighlight('москва', 'МОСКВА')).toEqual([{ text: 'москва', match: true }]);
  });

  it('пустой запрос ничего не подсвечивает', () => {
    expect(splitHighlight('ООО «Сфера»', '')).toEqual([{ text: 'ООО «Сфера»', match: false }]);
    expect(splitHighlight('ООО «Сфера»', '   ')).toEqual([{ text: 'ООО «Сфера»', match: false }]);
  });

  it('пустое значение', () => {
    expect(splitHighlight('', 'Сфера')).toEqual([]);
    expect(splitHighlight(null, 'Сфера')).toEqual([]);
  });

  // Запрос приходит из URL. Если строить из него RegExp без экранирования,
  // одна открывающая скобка роняет страницу.
  it('спецсимволы регулярок не ломают разбор', () => {
    expect(() => splitHighlight('ООО (Сфера)', '(')).not.toThrow();
    expect(splitHighlight('ООО (Сфера)', '(')).toEqual([
      { text: 'ООО ', match: false },
      { text: '(', match: true },
      { text: 'Сфера)', match: false },
    ]);
    expect(() => splitHighlight('a[b', '[')).not.toThrow();
    expect(() => splitHighlight('a.b', '.')).not.toThrow();
    // Точка не должна вести себя как «любой символ»
    expect(splitHighlight('abc', '.')).toEqual([{ text: 'abc', match: false }]);
  });

  it('совпадение в начале и в конце', () => {
    expect(splitHighlight('Сфера Групп', 'Сфера')).toEqual([
      { text: 'Сфера', match: true },
      { text: ' Групп', match: false },
    ]);
    expect(splitHighlight('Групп Сфера', 'Сфера')).toEqual([
      { text: 'Групп ', match: false },
      { text: 'Сфера', match: true },
    ]);
  });

  it('никогда не теряет и не дублирует символы', () => {
    for (const [value, query] of [
      ['ООО «Сфера» и Сфера', 'сфера'],
      ['ул. Ленина, д. 1', '.'],
      ['abc', ''],
      ['Ростов-на-Дону', '-'],
    ] as const) {
      expect(joined(value, query)).toBe(value);
    }
  });
});
