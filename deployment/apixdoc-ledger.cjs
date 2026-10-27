'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- This root-installed startup guard is CommonJS. */
// Installed root-owned. systemd runs this as dogeow-test-apixdoc (UID 974).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

function assertLedger(expected, records) {
  const names = Object.keys(expected).sort();
  if (!names.length || !Array.isArray(records) || records.length !== names.length)
    throw Error('Migration ledger count differs; apply schema changes separately');
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.migration_name) || !Object.hasOwn(expected, record.migration_name) ||
        !record.finished_at || record.rolled_back_at ||
        expected[record.migration_name] !== record.checksum)
      throw Error('Migration is pending, failed, unknown or has a checksum mismatch');
    seen.add(record.migration_name);
  }
}

function readExpected(root) {
  const folder = path.join(root, 'prisma/migrations');
  const result = {};
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+_[a-z0-9_]+$/.test(entry.name)) continue;
    const source = path.join(folder, entry.name, 'migration.sql');
    const info = fs.lstatSync(source);
    if (!info.isFile() || info.isSymbolicLink()) throw Error('Migration SQL must be a regular metadata file');
    result[entry.name] = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  }
  return result;
}

async function main() {
  if (process.getuid() !== 974) throw Error('Ledger check must run as the fixed application UID');
  const root = fs.realpathSync('/var/www/apixdoc/current');
  if (!/^\/var\/www\/apixdoc\/releases\/(?:source-39|[0-9a-f]{40})$/.test(root)) throw Error('Unexpected runtime root');
  const env = JSON.parse(fs.readFileSync('/etc/dogeow-tests/apixdoc.env.json', 'utf8'));
  if (typeof env.DATABASE_URL !== 'string') throw Error('Missing private database configuration');
  const requireRuntime = createRequire(path.join(root, 'package.json'));
  const { Client } = requireRuntime('pg');
  const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 3000, application_name: 'apixdoc-readonly-ledger' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    const result = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name');
    assertLedger(readExpected(root), result.rows);
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
  console.log('ApiXDoc migration ledger verified without schema or business writes');
}

module.exports = { assertLedger, readExpected };
if (require.main === module) main().catch(() => { console.error('ApiXDoc migration ledger rejected this runtime'); process.exitCode = 1; });
