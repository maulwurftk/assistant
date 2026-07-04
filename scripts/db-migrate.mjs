#!/usr/bin/env node
// ============================================================================
// Migrations-Runner (Betriebsplan §1): führt SQL-Dateien in gegebener
// Reihenfolge gegen SUPABASE_DB_URL (.env.local) aus — jede Datei in einer
// eigenen Transaktion. Benötigt: npm i -D pg
//
//   node scripts/db-migrate.mjs supabase/migrations-mt/0001_organizations.sql ...
//
// Staging-Schutz: bricht ab, wenn die Ziel-DB nach Prod aussieht (Nicht-Demo-
// Auth-User), außer man übergibt --allow-prod (für den späteren Cutover §6).
// ============================================================================
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv(join(root, '.env.local'));
if (!env.SUPABASE_DB_URL) {
  console.error('SUPABASE_DB_URL fehlt in .env.local');
  process.exit(1);
}

const allowProd = process.argv.includes('--allow-prod');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('Keine SQL-Dateien angegeben.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
await client.connect();

try {
  if (!allowProd) {
    const { rows } = await client.query(
      `select email from auth.users
       where email not like 'demo-%@example.com' and email not like 'test-%@example.com' limit 5`
    );
    if (rows.length > 0) {
      throw new Error(
        'Nicht-Demo-Auth-User in der Ziel-DB gefunden (' +
          rows.map((r) => r.email).join(', ') +
          ') — das sieht nach PROD aus. Abbruch. (Cutover: --allow-prod)'
      );
    }
  }

  for (const f of files) {
    const path = resolve(root, f);
    const sql = readFileSync(path, 'utf8');
    process.stdout.write(f + ' … ');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
      console.log('OK');
    } catch (e) {
      await client.query('rollback');
      console.log('FEHLER (rollback)');
      throw e;
    }
  }
} finally {
  await client.end();
}
