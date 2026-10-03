import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadServerModule } from './helpers/server-module';
import * as config from '../lib/site-config';

test('local saves, publish, stale conflicts and restores preserve published snapshots and audit history', async () => {
  process.env.SITE_MANAGEMENT_DB_PATH = join(mkdtempSync(join(tmpdir(), 'site-settings-')), 'settings.sqlite');
  const repo = loadServerModule<typeof import('../lib/site-local-store')>('lib/site-local-store.ts', { './site-config': config });
  const initial = repo.readLocalManagement();
  const draft = structuredClone(initial.draft); draft.packages[0].amount = 4100;
  const saved = repo.mutateLocalSettings('save', draft, initial.version, '', null);
  assert.equal(repo.readLocalManagement().published.packages[0].amount, 3500);
  assert.throws(() => repo.mutateLocalSettings('publish', null, initial.version, 'stale', null), /VERSION_CONFLICT/);
  const published = repo.mutateLocalSettings('publish', null, saved, 'Price update', null);
  const state = repo.readLocalManagement();
  assert.equal(state.published.packages[0].amount, 4100);
  assert.equal(state.history.length, 2);
  const original = state.history.find(row => row.version === 0)!;
  repo.mutateLocalSettings('restore', null, published, '', original.id);
  assert.equal(repo.readLocalManagement().draft.packages[0].amount, 3500);
  assert.equal(repo.readLocalManagement().published.packages[0].amount, 4100);
  assert.deepEqual(repo.readLocalManagement().activity.map(x => x.action), ['restore', 'publish', 'save']);
});
