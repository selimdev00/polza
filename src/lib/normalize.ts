// Города, реально встречающиеся в выгрузке page_*.json. Используются как
// словарь для канонизации: всё, что не совпало точно, сопоставляется по
// расстоянию Левенштейна с порогом 2.
export const KNOWN_CITIES = [
  'Волгоград', 'Воронеж', 'Екатеринбург', 'Казань', 'Калуга',
  'Краснодар', 'Москва', 'Нижний Новгород', 'Новосибирск', 'Омск',
  'Пермь', 'Ростов-на-Дону', 'Самара', 'Санкт-Петербург', 'Сочи',
  'Тула', 'Тюмень', 'Уфа', 'Челябинск', 'Ярославль',
] as const;

// Латинские написания, которые расстоянием Левенштейна не поймать.
const CITY_ALIASES: Record<string, string> = {
  moscow: 'Москва',
  'saint petersburg': 'Санкт-Петербург',
  'st petersburg': 'Санкт-Петербург',
  spb: 'Санкт-Петербург',
};

// Обратная таблица cp1251: строится один раз декодированием байтов 0..255.
// Так не нужен ни iconv-lite, ни захардкоженная таблица.
const CP1251_TO_BYTE: Map<string, number> = (() => {
  const decoder = new TextDecoder('windows-1251');
  const map = new Map<string, number>();
  for (let byte = 0; byte < 256; byte += 1) {
    const char = decoder.decode(new Uint8Array([byte]));
    if (!map.has(char)) map.set(char, byte);
  }
  return map;
})();

const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });
const CYRILLIC = /[а-яёА-ЯЁ]/;

/**
 * Чинит текст, чьи utf-8 байты были прочитаны как cp1251.
 * Кодируем обратно в cp1251 и декодируем как utf-8 в строгом режиме:
 * если это был не моджибейк, декодирование упадёт и вернётся исходная строка.
 */
export function repairMojibake(value: string): string {
  if (!value) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const byte = CP1251_TO_BYTE.get(value[i]);
    if (byte === undefined) return value;
    bytes[i] = byte;
  }
  try {
    const decoded = UTF8_STRICT.decode(bytes);
    // Осмысленной починкой считаем только ту, что дала кириллицу.
    return CYRILLIC.test(decoded) ? decoded : value;
  } catch {
    return value;
  }
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export function canonicalCity(value: string): { value: string | null; repaired: boolean } {
  const raw = value ?? '';
  const repairedText = repairMojibake(raw);
  const trimmed = repairedText.replace(/\s+/g, ' ').trim();
  if (!trimmed) return { value: null, repaired: false };

  // Само по себе точное совпадение ещё не значит «без правок»: строка могла
  // быть починена от моджибейка или обрезана по пробелам до этого места.
  const exact = KNOWN_CITIES.find((city) => city === trimmed);
  if (exact) return { value: exact, repaired: repairedText !== raw || trimmed !== raw };

  const lower = trimmed.toLowerCase();

  const caseOnly = KNOWN_CITIES.find((city) => city.toLowerCase() === lower);
  if (caseOnly) return { value: caseOnly, repaired: true };

  const alias = CITY_ALIASES[lower];
  if (alias) return { value: alias, repaired: true };

  // Адрес городом не считаем: без этой отсечки строка со сдвигом колонок
  // «почти совпала» бы с каким-нибудь коротким названием.
  if (/^(ул|пр|пер|ш|наб|б-р|просп)\.?\s/i.test(trimmed) || trimmed.includes(', д.')) {
    return { value: null, repaired: false };
  }

  let best: { city: string; distance: number } | null = null;
  for (const city of KNOWN_CITIES) {
    const distance = levenshtein(city.toLowerCase(), lower);
    if (!best || distance < best.distance) best = { city, distance };
  }
  if (best && best.distance <= 2) return { value: best.city, repaired: true };

  return { value: null, repaired: false };
}

export function parseRating(value: string | null): { value: number | null; code: string | null } {
  const raw = (value ?? '').trim();
  if (!raw) return { value: null, code: null };

  let code: string | null = null;
  let text = raw;
  if (text.includes(',')) {
    text = text.replace(',', '.');
    code = 'rating_comma_decimal';
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return { value: null, code: 'rating_unparseable' };
  if (parsed < 0 || parsed > 5) return { value: null, code: 'rating_out_of_range' };

  return { value: Math.round(parsed * 10) / 10, code };
}

export function parseReviewsCount(value: string | null): { value: number; code: string | null } {
  const raw = (value ?? '').trim();
  if (!raw) return { value: 0, code: null };

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { value: 0, code: 'reviews_unparseable' };
  if (parsed < 0) return { value: 0, code: 'reviews_negative' };
  if (!Number.isInteger(parsed)) return { value: Math.trunc(parsed), code: 'reviews_fractional' };

  return { value: parsed, code: null };
}

export function normalizeSite(value: string | null): { value: string | null; code: string | null } {
  const raw = repairMojibake((value ?? '').trim());
  if (!raw) return { value: null, code: null };

  let text = raw;
  let code: string | null = null;

  // Опечатки в схеме: htp://, htttp://, htps:// и подобное.
  const typo = /^(h?t{1,3}ps?):\/\//i.exec(text);
  if (typo && !/^https?:\/\//i.test(text)) {
    text = text.replace(typo[0], typo[1].includes('s') ? 'https://' : 'http://');
    code = 'site_scheme_typo';
  }

  if (!/^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+/i.test(text)) {
    return { value: null, code: 'site_invalid' };
  }

  return { value: text, code };
}

export function normalizePhone(value: string | null): { value: string | null; code: string | null } {
  const raw = (value ?? '').trim();
  if (!raw) return { value: null, code: null };

  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return { value: null, code: 'phone_invalid' };
  if (digits[0] !== '7' && digits[0] !== '8') return { value: null, code: 'phone_invalid' };
  // Буквы в номере - это не «нечитаемый формат», а мусор: отбрасываем.
  if (/[a-zA-Zа-яА-Я]/.test(raw)) return { value: null, code: 'phone_invalid' };

  return { value: `+7${digits.slice(1)}`, code: null };
}
