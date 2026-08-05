import pg from 'pg';

// pg возвращает numeric как строку, чтобы не терять точность.
// Для rating (numeric(2,1)) это неудобно, поэтому парсим в число явно.
pg.types.setTypeParser(1700, (value: string) => (value === null ? null : Number(value)));

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL не задан. Скопируйте .env.example в .env');
    }
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
