'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- These checks exercise the CommonJS startup guard. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertLedger, readExpected } = require('../../deployment/apixdoc-ledger.cjs');
const expected = { '20260901_initial': 'a'.repeat(64), '20260902_accounts': 'b'.repeat(64) };
const rows = () => Object.entries(expected).map(([migration_name, checksum]) => ({ migration_name, checksum, finished_at: new Date(), rolled_back_at: null }));
test('accepts only the exact fully applied ledger', () => assert.doesNotThrow(() => assertLedger(expected, rows())));
test('rejects a new pending migration', () => assert.throws(() => assertLedger({ ...expected, '20260903_new': 'c'.repeat(64) }, rows())));
test('rejects a changed existing SQL checksum', () => { const r = rows(); r[0].checksum = 'c'.repeat(64); assert.throws(() => assertLedger(expected, r)); });
test('rejects an unfinished migration', () => { const r = rows(); r[0].finished_at = null; assert.throws(() => assertLedger(expected, r)); });
test('rejects a rolled back migration', () => { const r = rows(); r[0].rolled_back_at = new Date(); assert.throws(() => assertLedger(expected, r)); });
test('rejects an unknown extra DB migration', () => assert.throws(() => assertLedger(expected, [...rows(), { migration_name: 'unknown' }])));
test('rejects duplicate ledger records', () => { const r = rows(); r[1] = r[0]; assert.throws(() => assertLedger(expected, r)); });
test('rejects an empty manifest', () => assert.throws(() => assertLedger({}, [])));
test('reads eight original migration SQL checksum metadata files', () => { const result = readExpected(require('node:path').resolve(__dirname, '../..')); assert.equal(Object.keys(result).length, 8); for (const hash of Object.values(result)) assert.match(hash, /^[0-9a-f]{64}$/); });
