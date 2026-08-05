import pg from 'pg';

// pg возвращает numeric как строку, чтобы не терять точность.
// Для rating (numeric(2,1)) это неудобно, поэтому парсим в число явно.
pg.types.setTypeParser(1700, (value: string) => Number(value));

// Пул кэшируется на globalThis, а не в переменной модуля. В dev-режиме
// Next.js переоценивает серверные модули при каждой правке файла, и с
// обычной переменной каждая правка создавала бы новый пул на 10 соединений,
// не закрывая предыдущий. За сессию отладки это выедает лимит соединений
// postgres. Для скриптов, где процесс живёт одну команду, разницы нет.
const globalForPool = globalThis as typeof globalThis & { __polzaPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPool.__polzaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL не задан. Скопируйте .env.example в .env');
    }
    globalForPool.__polzaPool = new pg.Pool({ connectionString, max: 10 });
  }
  return globalForPool.__polzaPool;
}

export async function closePool(): Promise<void> {
  if (globalForPool.__polzaPool) {
    await globalForPool.__polzaPool.end();
    globalForPool.__polzaPool = undefined;
  }
}
