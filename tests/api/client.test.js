import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../public/js/api/client.js';

test('api.getAll reads every page and preserves existing filters', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url, 'http://localhost');
    calls.push(parsed);
    const page = Number(parsed.searchParams.get('page'));
    const body = page === 1
      ? { data: [{ id: 'a' }, { id: 'b' }], total: 3, page, pageSize: 200 }
      : { data: [{ id: 'c' }], total: 3, page, pageSize: 200 };
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  };

  try {
    const rows = await api.getAll('/api/items?category=armor&pageSize=5000');
    assert.deepEqual(rows.map((row) => row.id), ['a', 'b', 'c']);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.searchParams.get('page')), ['1', '2']);
    assert.ok(calls.every((call) => call.searchParams.get('category') === 'armor'));
    assert.ok(calls.every((call) => call.searchParams.get('pageSize') === '200'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api writes invalidate cached lists', async () => {
  const originalFetch = globalThis.fetch;
  let listCalls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'PATCH') {
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ saved: true }),
      };
    }
    listCalls += 1;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: [{ id: 'cached' }], total: 1, page: 1, pageSize: 200 }),
    };
  };

  try {
    await api.getAll('/api/test-cache');
    await api.getAll('/api/test-cache');
    assert.equal(listCalls, 1);
    await api.patch('/api/items/item-1', { name: 'Updated' });
    await api.getAll('/api/test-cache');
    assert.equal(listCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
