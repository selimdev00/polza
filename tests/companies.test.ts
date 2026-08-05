import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  parseCompanyPageParams,
  resolvePageSize,
  resolveSortDir,
  resolveSortKey,
  SORT_KEYS,
} from '../src/lib/companies.ts';

// Эти тесты - прямая демонстрация той самой защиты от SQL-инъекции через
// ORDER BY/LIMIT, описанной в комментариях companies.ts: неизвестный или
// вредоносный параметр никогда не долетает до SQL-текста, а тихо
// откатывается к одному из захардкоженных значений.

describe('resolveSortKey', () => {
  it('пропускает только колонки из белого списка', () => {
    for (const key of SORT_KEYS) {
      expect(resolveSortKey(key)).toBe(key);
    }
  });

  it('откатывается к дефолту на неизвестном ключе', () => {
    expect(resolveSortKey('reviews_count; DROP TABLE companies;--')).toBe(DEFAULT_SORT_KEY);
    expect(resolveSortKey('id')).toBe(DEFAULT_SORT_KEY);
    expect(resolveSortKey('')).toBe(DEFAULT_SORT_KEY);
    expect(resolveSortKey(undefined)).toBe(DEFAULT_SORT_KEY);
  });
});

describe('resolveSortDir', () => {
  it('принимает только asc и desc', () => {
    expect(resolveSortDir('asc')).toBe('asc');
    expect(resolveSortDir('desc')).toBe('desc');
  });

  it('откатывается к asc на любом другом значении', () => {
    expect(resolveSortDir('DESC')).toBe(DEFAULT_SORT_DIR);
    expect(resolveSortDir('descending')).toBe(DEFAULT_SORT_DIR);
    expect(resolveSortDir('')).toBe(DEFAULT_SORT_DIR);
    expect(resolveSortDir(undefined)).toBe(DEFAULT_SORT_DIR);
  });
});

describe('resolvePageSize', () => {
  it('пропускает только значения из PAGE_SIZE_OPTIONS', () => {
    for (const size of PAGE_SIZE_OPTIONS) {
      expect(resolvePageSize(String(size))).toBe(size);
    }
  });

  it('отклоняет произвольно большой limit и откатывается к дефолту', () => {
    expect(resolvePageSize('99999999')).toBe(PAGE_SIZE);
  });

  it('отклоняет нечисловые и пустые значения', () => {
    expect(resolvePageSize('25; DROP TABLE companies;--')).toBe(PAGE_SIZE);
    expect(resolvePageSize('abc')).toBe(PAGE_SIZE);
    expect(resolvePageSize('')).toBe(PAGE_SIZE);
    expect(resolvePageSize(undefined)).toBe(PAGE_SIZE);
  });

  it('отклоняет значения, близкие к разрешённым, но не совпадающие точно', () => {
    expect(resolvePageSize('26')).toBe(PAGE_SIZE);
    expect(resolvePageSize('100.5')).toBe(PAGE_SIZE);
    expect(resolvePageSize('-25')).toBe(PAGE_SIZE);
  });
});

// Регрессия на продовый краш: Next отдаёт повторяющийся query-параметр
// (?city=a&city=b) массивом строк, а не строкой. Прежняя сигнатура
// searchParams (Promise<{ q?: string; ... }>) лгала об этом рантайме -
// (params.q ?? '').trim() падало на массиве, и пользователь видел error.tsx
// с диагнозом "база недоступна". parseCompanyPageParams - единственное
// место, где сырой searchParams превращается в типизированные поля
// страницы, и это единственный тест, который проверяет его на входе именно
// такой формы, какую Next реально присылает.
describe('parseCompanyPageParams', () => {
  it('берёт первое значение повторяющегося строкового параметра', () => {
    expect(parseCompanyPageParams({ q: ['a', 'b'] }).q).toBe('a');
    expect(parseCompanyPageParams({ city: ['a', 'b'] }).city).toBe('a');
    expect(parseCompanyPageParams({ category: ['a', 'b'] }).category).toBe('a');
  });

  it('берёт первое значение повторяющегося sort/dir/page/limit', () => {
    const params = parseCompanyPageParams({
      sort: ['name', 'rating'],
      dir: ['desc', 'asc'],
      page: ['2', '3'],
      limit: ['50', '100'],
    });
    expect(params.sort).toBe('name');
    expect(params.dir).toBe('desc');
    expect(params.page).toBe(2);
    expect(params.pageSize).toBe(50);
  });

  it('обрезает пробелы у первого значения массива', () => {
    expect(parseCompanyPageParams({ q: ['  a  ', 'b'] }).q).toBe('a');
  });

  it('не падает на пустом массиве', () => {
    const params = parseCompanyPageParams({ q: [], city: [] });
    expect(params.q).toBe('');
    expect(params.city).toBe('');
  });

  it('ведёт себя как раньше на обычных одиночных значениях', () => {
    const params = parseCompanyPageParams({
      q: 'кофе',
      city: 'Москва',
      category: 'Кафе',
      hasSite: '1',
      sort: 'rating',
      dir: 'desc',
      limit: '50',
      page: '3',
    });
    expect(params).toEqual({
      q: 'кофе',
      city: 'Москва',
      category: 'Кафе',
      hasSite: true,
      sort: 'rating',
      dir: 'desc',
      pageSize: 50,
      page: 3,
    });
  });

  it('подставляет дефолты на отсутствующих параметрах', () => {
    const params = parseCompanyPageParams({});
    expect(params).toEqual({
      q: '',
      city: '',
      category: '',
      hasSite: false,
      sort: DEFAULT_SORT_KEY,
      dir: DEFAULT_SORT_DIR,
      pageSize: PAGE_SIZE,
      page: 1,
    });
  });
});
