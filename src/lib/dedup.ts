import { KNOWN_CITIES, canonicalCity, repairMojibake } from './normalize.ts';

export interface RawRow {
  ext_id: string | null;
  name: string | null;
  category: string | null;
  city: string | null;
  address: string | null;
  rating: string | null;
  reviews_count: string | null;
  site: string | null;
  phone: string | null;
}

/**
 * Ключ сравнения, а не отображения. Название компании в базе хранится как
 * пришло; здесь снимаются кавычки, регистр, пунктуация и лишние пробелы,
 * чтобы «Модуль Строй» и Модуль Строй считались одной компанией.
 */
export function normalizeForKey(value: string | null): string {
  return repairMojibake(value ?? '')
    .toLowerCase()
    .replace(/[«»""'']/g, '')
    .replace(/[.,()]/g, ' ')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDedupKey(input: {
  name: string;
  city: string;
  address: string | null;
}): string {
  return [
    normalizeForKey(input.name),
    normalizeForKey(input.city),
    normalizeForKey(input.address),
  ].join('|');
}

/**
 * Ловит строку, в которой на выгрузке потерялось одно поле и всё
 * последующее уехало влево на колонку.
 *
 * Признак: в category лежит название города, в city лежит адрес, а address
 * пуст. Все три условия обязательны - по отдельности каждое встречается и в
 * нормальных строках.
 *
 * Чиним сдвигом вправо: address <- city, city <- category, category <- null.
 * Значение категории восстановить неоткуда, поэтому оно остаётся пустым.
 */
export function detectColumnShift(input: RawRow): { shifted: boolean; row: RawRow } {
  const category = (input.category ?? '').trim();
  const city = (input.city ?? '').trim();
  const address = (input.address ?? '').trim();

  const categoryLooksLikeCity = KNOWN_CITIES.some((known) => known === category);
  const cityLooksLikeAddress = canonicalCity(city).value === null && city.length > 0;
  const addressIsEmpty = address.length === 0;

  if (!(categoryLooksLikeCity && cityLooksLikeAddress && addressIsEmpty)) {
    return { shifted: false, row: input };
  }

  return {
    shifted: true,
    row: { ...input, category: null, city: category, address: city },
  };
}
