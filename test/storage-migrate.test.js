import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateStorage } from '../src/storage-migrate.js';

const store = entries => {
  const m = new Map(Object.entries(entries));
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) };
};

test('old court-builder keys move to build-lab, without overwriting and dropping dead ones', () => {
  const s = store({ 'court-builder.saved-builds.v1': '[1]', 'court-builder.prefs.v3': '{"a":1}', 'build-lab.prefs.v3': '{"new":1}',
    'court-builder.vibes.v1': '{}', 'other-app': 'x' });
  assert.equal(migrateStorage(s), 1);
  assert.deepEqual(s.dump(), { 'build-lab.prefs.v3': '{"new":1}', 'other-app': 'x', 'build-lab.saved-builds.v1': '[1]' });
  assert.equal(migrateStorage(s), 0);
});
