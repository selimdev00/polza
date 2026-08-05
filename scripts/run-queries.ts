import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool, getPool } from '../src/lib/db.ts';

const queriesPath = resolve(import.meta.dirname, '../db/queries.sql');

interface NamedQuery { title: string; sql: string }

function splitQueries(text: string): NamedQuery[] {
  const result: NamedQuery[] = [];
  let current: NamedQuery | null = null;

  for (const line of text.split('\n')) {
    const marker = /^--\s*@query\s+(.+)$/.exec(line.trim());
    if (marker) {
      if (current) result.push(current);
      current = { title: marker[1].trim(), sql: '' };
      continue;
    }
    if (current) current.sql += `${line}\n`;
  }
  if (current) result.push(current);

  return result.filter((query) => query.sql.trim().length > 0);
}

async function main(): Promise<void> {
  const queries = splitQueries(await readFile(queriesPath, 'utf8'));
  const pool = getPool();

  for (const [index, query] of queries.entries()) {
    console.log('');
    console.log(`${index + 1}. ${query.title}`);
    console.log('-'.repeat(query.title.length + 3));
    const result = await pool.query(query.sql);
    console.table(result.rows);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
