import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { loadEnv } from './lib/env';

loadEnv();

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ['connection_limit', 'pool_timeout', 'pgbouncer']) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return url;
  }
}

async function main() {
  const url = cleanUrl(process.env.DATABASE_URL || '');
  if (!url) throw new Error('DATABASE_URL이 없습니다.');
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 2,
  });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const dir = path.join(process.cwd(), 'db', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set((await client.query('select filename from schema_migrations')).rows.map((r: any) => r.filename));
    for (const file of files) {
      if (applied.has(file)) {
        console.log('skip', file);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      console.log('apply', file);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations(filename) values($1)', [file]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
    }
    console.log('migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('migration failed:', e);
  process.exit(1);
});
