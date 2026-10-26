import { test } from 'node:test';
import assert from 'node:assert/strict';

test('D1 adapter preserves SQL parameters and handles failed responses', async () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
  process.env.CLOUDFLARE_D1_DATABASE_ID = 'test-db';
  process.env.CLOUDFLARE_D1_API_TOKEN = 'test-token';
  const { database } = await import('../lib/database.ts');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ success: true, result: [{ success: true, results: [{ body: 'saved', checked_at: 12 }] }] });
  };
  try {
    assert.equal((await database.prepare('SELECT body WHERE key=?').bind('x').first()).body, 'saved');
    assert.deepEqual(calls[0].body, { sql: 'SELECT body WHERE key=?', params: ['x'] });
    assert.equal(calls[0].headers.Authorization, 'Bearer test-token');
    await database.batch([database.prepare('INSERT ?').bind(5), database.prepare('INSERT ?').bind(6)]);
    assert.deepEqual(calls[1].body, { batch: [{ sql: 'INSERT ?', params: [5] }, { sql: 'INSERT ?', params: [6] }] });
    globalThis.fetch = async () => Response.json({ success: false }, { status: 403 });
    await assert.rejects(database.prepare('SELECT 1').all(), /D1 query failed \(403\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
