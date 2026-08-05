import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
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
