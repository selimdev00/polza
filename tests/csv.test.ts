import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/lib/csv.ts';

describe('parseCsv', () => {
  it('разбирает поле в кавычках с запятыми внутри как одно поле', () => {
    const { rows } = parseCsv('id,address\n1,"ул. Садовая, д. 112, офис 16"\n');
    expect(rows).toEqual([['1', 'ул. Садовая, д. 112, офис 16']]);
  });

  it('разбирает удвоенную кавычку внутри поля как экранированную', () => {
    const { rows } = parseCsv('id,name\n1,"ООО ""Ромашка"""\n');
    expect(rows).toEqual([['1', 'ООО "Ромашка"']]);
  });

  it('не оставляет лишний \\r в полях при CRLF-переносах строк', () => {
    const { header, rows } = parseCsv('id,name\r\n1,АО Сокол\r\n2,АО Прайм\r\n');
    expect(header).toEqual(['id', 'name']);
    for (const row of rows) {
      for (const cell of row) {
        expect(cell).not.toContain('\r');
      }
    }
    expect(rows).toEqual([['1', 'АО Сокол'], ['2', 'АО Прайм']]);
  });

  it('завершающий перенос строки в конце файла не создаёт лишнюю строку', () => {
    const { rows } = parseCsv('id,name\n1,АО Сокол\n');
    expect(rows).toEqual([['1', 'АО Сокол']]);
  });

  it('полностью пустая строка разбирается в строку из пустых полей, а не пропускается', () => {
    const { rows } = parseCsv('a,b,c\n1,2,3\n,,\n4,5,6\n');
    expect(rows).toEqual([
      ['1', '2', '3'],
      ['', '', ''],
      ['4', '5', '6'],
    ]);
  });

  it('пустое поле в кавычках даёт пустую строку', () => {
    const { rows } = parseCsv('id,name\n1,""\n');
    expect(rows).toEqual([['1', '']]);
  });

  it('перенос строки внутри поля в кавычках остаётся частью одного поля', () => {
    const { rows } = parseCsv('id,note\n1,"первая строка\nвторая строка"\n2,ok\n');
    expect(rows).toEqual([
      ['1', 'первая строка\nвторая строка'],
      ['2', 'ok'],
    ]);
  });

  it('строка заголовка возвращается отдельно от строк данных', () => {
    const { header, rows } = parseCsv('id,name,city\n1,АО Сокол,Пермь\n');
    expect(header).toEqual(['id', 'name', 'city']);
    expect(rows).toEqual([['1', 'АО Сокол', 'Пермь']]);
  });
});
