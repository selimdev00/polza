import { describe, expect, it } from 'vitest';
import {
  canonicalCity,
  levenshtein,
  normalizePhone,
  normalizeSite,
  parseRating,
  parseReviewsCount,
  repairMojibake,
} from '../src/lib/normalize.ts';

describe('repairMojibake', () => {
  it('восстанавливает строку, прочитанную как cp1251 вместо utf-8', () => {
    expect(repairMojibake('РћРћРћ В«Р—Р°СЂСЏ РўРµС…В»')).toBe('ООО «Заря Тех»');
    expect(repairMojibake('РЎР°РЅРєС‚-РџРµС‚РµСЂР±СѓСЂРі')).toBe('Санкт-Петербург');
    expect(repairMojibake('РњРѕСЃРєРІР°')).toBe('Москва');
  });

  it('не трогает нормальный текст', () => {
    expect(repairMojibake('Москва')).toBe('Москва');
    expect(repairMojibake('ООО «Заря Тех»')).toBe('ООО «Заря Тех»');
    expect(repairMojibake('ИП Иванов Д. С.')).toBe('ИП Иванов Д. С.');
    expect(repairMojibake('Ростов-на-Дону')).toBe('Ростов-на-Дону');
    expect(repairMojibake('')).toBe('');
  });
});

describe('levenshtein', () => {
  it('считает расстояние редактирования', () => {
    expect(levenshtein('Москва', 'Москва')).toBe(0);
    expect(levenshtein('Санкат-Петербург', 'Санкт-Петербург')).toBe(1);
    expect(levenshtein('Москва', 'Казань')).toBeGreaterThan(2);
  });
});

describe('canonicalCity', () => {
  it('оставляет корректный город как есть', () => {
    expect(canonicalCity('Москва')).toEqual({ value: 'Москва', repaired: false });
  });

  it('чинит регистр, пробелы, латиницу и опечатки', () => {
    expect(canonicalCity('москва')).toEqual({ value: 'Москва', repaired: true });
    expect(canonicalCity('Москва ')).toEqual({ value: 'Москва', repaired: true });
    expect(canonicalCity('Moscow')).toEqual({ value: 'Москва', repaired: true });
    expect(canonicalCity('Санкат-Петербург')).toEqual({ value: 'Санкт-Петербург', repaired: true });
  });

  it('чинит моджибейк перед сопоставлением', () => {
    expect(canonicalCity('РњРѕСЃРєРІР°')).toEqual({ value: 'Москва', repaired: true });
  });

  it('возвращает null, если это вообще не город', () => {
    expect(canonicalCity('ул. Советская, д. 89, офис 43').value).toBeNull();
    expect(canonicalCity('').value).toBeNull();
  });

  it('не превращает короткий мусор в город', () => {
    expect(canonicalCity('УАЗ').value).toBeNull();
    expect(canonicalCity('США').value).toBeNull();
  });
});

describe('parseRating', () => {
  it('принимает корректный рейтинг', () => {
    expect(parseRating('4.1')).toEqual({ value: 4.1, code: null });
  });

  it('чинит десятичную запятую', () => {
    expect(parseRating('4,5')).toEqual({ value: 4.5, code: 'rating_comma_decimal' });
  });

  it('обнуляет значения вне диапазона 0..5', () => {
    expect(parseRating('-3')).toEqual({ value: null, code: 'rating_out_of_range' });
    expect(parseRating('7.2')).toEqual({ value: null, code: 'rating_out_of_range' });
  });

  it('обнуляет нечисловое', () => {
    expect(parseRating('N/A')).toEqual({ value: null, code: 'rating_unparseable' });
  });

  it('пустое значение - это отсутствие рейтинга, а не ошибка', () => {
    expect(parseRating('')).toEqual({ value: null, code: null });
    expect(parseRating(null)).toEqual({ value: null, code: null });
  });

  it('границы диапазона включительно', () => {
    expect(parseRating('0')).toEqual({ value: 0, code: null });
    expect(parseRating('5')).toEqual({ value: 5, code: null });
  });
});

describe('parseReviewsCount', () => {
  it('принимает целое число', () => {
    expect(parseReviewsCount('191')).toEqual({ value: 191, code: null });
    expect(parseReviewsCount('0')).toEqual({ value: 0, code: null });
  });

  it('отрицательное количество отзывов невозможно', () => {
    expect(parseReviewsCount('-10')).toEqual({ value: 0, code: 'reviews_negative' });
  });

  it('дробное количество отзывов усекается', () => {
    expect(parseReviewsCount('45.5')).toEqual({ value: 45, code: 'reviews_fractional' });
  });

  it('слово вместо числа', () => {
    expect(parseReviewsCount('много')).toEqual({ value: 0, code: 'reviews_unparseable' });
  });

  it('пусто - это ноль', () => {
    expect(parseReviewsCount('')).toEqual({ value: 0, code: null });
    expect(parseReviewsCount(null)).toEqual({ value: 0, code: null });
  });
});

describe('normalizeSite', () => {
  it('оставляет корректный адрес', () => {
    expect(normalizeSite('https://sfera-group-229.ru'))
      .toEqual({ value: 'https://sfera-group-229.ru', code: null });
    expect(normalizeSite('http://grant-media-82.ru'))
      .toEqual({ value: 'http://grant-media-82.ru', code: null });
  });

  it('чинит опечатку в схеме', () => {
    expect(normalizeSite('htp://sintez-service-453.ru'))
      .toEqual({ value: 'http://sintez-service-453.ru', code: 'site_scheme_typo' });
  });

  it('отбрасывает мусор', () => {
    expect(normalizeSite('https://')).toEqual({ value: null, code: 'site_invalid' });
    expect(normalizeSite('нет сайта')).toEqual({ value: null, code: 'site_invalid' });
  });

  it('пусто - это отсутствие сайта', () => {
    expect(normalizeSite('')).toEqual({ value: null, code: null });
    expect(normalizeSite(null)).toEqual({ value: null, code: null });
  });
});

describe('normalizePhone', () => {
  it('приводит к E.164', () => {
    expect(normalizePhone('+7 (495) 248-44-40'))
      .toEqual({ value: '+74952484440', code: null });
    expect(normalizePhone('8 (925) 401-78-83'))
      .toEqual({ value: '+79254017883', code: null });
  });

  it('отбрасывает нечитаемое', () => {
    expect(normalizePhone('8 (925) abc-12-34')).toEqual({ value: null, code: 'phone_invalid' });
    expect(normalizePhone('+7')).toEqual({ value: null, code: 'phone_invalid' });
  });

  it('пусто - это отсутствие телефона', () => {
    expect(normalizePhone('')).toEqual({ value: null, code: null });
    expect(normalizePhone(null)).toEqual({ value: null, code: null });
  });
});
