import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPool, closePool } from '../src/lib/db.ts';

const schemaPath = resolve(import.meta.dirname, '../db/schema.sql');

async function main(): Promise<void> {
  const sql = await readFile(schemaPath, 'utf8');
  const pool = getPool();
  await pool.query(sql);
  console.log('Схема применена:', schemaPath);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
