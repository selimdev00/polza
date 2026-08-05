import { describe, expect, it } from 'vitest';
import { buildDedupKey, detectColumnShift, normalizeForKey, type RawRow } from '../src/lib/dedup.ts';

function row(overrides: Partial<RawRow>): RawRow {
  return {
    ext_id: 'c_000001',
    name: 'ООО «Тест»',
    category: 'Кофейня',
    city: 'Москва',
    address: 'ул. Ленина, д. 1',
    rating: '4.0',
    reviews_count: '10',
    site: null,
    phone: null,
    ...overrides,
  };
}

describe('normalizeForKey', () => {
  it('снимает кавычки, регистр и лишние пробелы', () => {
    expect(normalizeForKey('АО «Флагман Лаб»')).toBe(normalizeForKey('АО Флагман Лаб'));
    expect(normalizeForKey('«Модуль Строй»')).toBe(normalizeForKey('Модуль Строй'));
    expect(normalizeForKey('  ООО   «Сокол»  ')).toBe(normalizeForKey('ооо сокол'));
  });

  it('чинит моджибейк перед нормализацией', () => {
    expect(normalizeForKey('РћРћРћ В«Р—Р°СЂСЏ РўРµС…В»')).toBe(normalizeForKey('ООО «Заря Тех»'));
  });
});

describe('buildDedupKey', () => {
  // Шесть теневых дублей из review.csv: те же компании под новым
  // пространством id, отличаются только снятыми кавычками.
  const shadowPairs: Array<[string, string, string, string]> = [
    ['АО «Флагман Лаб»', 'АО Флагман Лаб', 'Пермь', 'ул. Южная, д. 113'],
    ['АО «Сокол»', 'АО Сокол', 'Пермь', 'ул. Советская, д. 81'],
    ['«Модуль Строй»', 'Модуль Строй', 'Ростов-на-Дону', 'ул. Набережная, д. 36'],
    ['АО «Сокол Лаб»', 'АО Сокол Лаб', 'Воронеж', 'ул. Северная, д. 30'],
    ['«Прайм Плюс»', 'Прайм Плюс', 'Пермь', 'ул. Пушкина, д. 86'],
    ['АО «Орион Групп»', 'АО Орион Групп', 'Москва', 'ул. Центральная, д. 44'],
  ];

  it.each(shadowPairs)('склеивает %s и %s', (base, shadow, city, address) => {
    expect(buildDedupKey({ name: base, city, address }))
      .toBe(buildDedupKey({ name: shadow, city, address }));
  });

  it('не склеивает одноимённые ИП из разных городов', () => {
    const krasnodar = buildDedupKey({ name: 'ИП Иванов Д. С.', city: 'Краснодар', address: 'ул. Ленина, д. 94' });
    const chelyabinsk = buildDedupKey({ name: 'ИП Иванов Б. П.', city: 'Челябинск', address: 'ул. Ленина, д. 108' });
    expect(krasnodar).not.toBe(chelyabinsk);
  });

  it('не склеивает одинаковые названия по разным адресам', () => {
    const a = buildDedupKey({ name: 'ООО «Сфера Групп»', city: 'Москва', address: 'ул. Ленина, д. 1' });
    const b = buildDedupKey({ name: 'ООО «Сфера Групп»', city: 'Москва', address: 'ул. Ленина, д. 2' });
    expect(a).not.toBe(b);
  });
});

describe('detectColumnShift', () => {
  it('распознаёт и чинит строку со сдвигом колонок', () => {
    const broken = row({
      ext_id: 'c_001015',
      name: 'АО «Платформа»',
      category: 'Пермь',
      city: 'ул. Советская, д. 89, офис 43',
      address: '',
    });

    const result = detectColumnShift(broken);

    expect(result.shifted).toBe(true);
    expect(result.row.city).toBe('Пермь');
    expect(result.row.address).toBe('ул. Советская, д. 89, офис 43');
    // Значение категории потеряно на выгрузке, придумывать его нельзя.
    expect(result.row.category).toBeNull();
    // Остальные поля не трогаем.
    expect(result.row.rating).toBe('4.0');
    expect(result.row.name).toBe('АО «Платформа»');
  });

  it('не трогает нормальную строку', () => {
    const ok = row({});
    const result = detectColumnShift(ok);
    expect(result.shifted).toBe(false);
    expect(result.row).toEqual(ok);
  });

  it('не срабатывает, когда категория совпала с городом случайно, но адрес на месте', () => {
    const tricky = row({ category: 'Пермь', city: 'Пермь', address: 'ул. Ленина, д. 5' });
    expect(detectColumnShift(tricky).shifted).toBe(false);
  });
});
