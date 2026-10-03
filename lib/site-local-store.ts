import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_SITE_CONFIG, validateSiteConfig, type SiteConfig, type SiteManagementData, type SiteActivityEntry, type SiteHistoryEntry } from './site-config';

export type SiteAsset = { id: string; kind: 'guide' | 'release'; mime: string; size: number; name: string; objectPath: string; createdAt: string };
const path = process.env.SITE_MANAGEMENT_DB_PATH || join(process.cwd(), '.local', 'site-management.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS site_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, draft TEXT NOT NULL, published TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS site_history (id TEXT PRIMARY KEY, version INTEGER NOT NULL, config TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS site_activity (id TEXT PRIMARY KEY, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS site_assets (id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
const initial = JSON.stringify(DEFAULT_SITE_CONFIG);
db.prepare('INSERT OR IGNORE INTO site_state VALUES (1,0,?,?)').run(initial, initial);
if (!db.prepare('SELECT id FROM site_history LIMIT 1').get()) db.prepare('INSERT INTO site_history VALUES (?,?,?,?,?)').run(randomUUID(), 0, initial, 'Initial website', new Date().toISOString());

export function appendLocalActivity(action: string, detail: string) {
  db.prepare('INSERT INTO site_activity VALUES (?,?,?,?)').run(randomUUID(), action.slice(0, 100), detail.slice(0, 500), new Date().toISOString());
}
export function readLocalManagement(): SiteManagementData {
  const row = db.prepare('SELECT * FROM site_state WHERE id=1').get() as { version: number; draft: string; published: string };
  const history = db.prepare('SELECT * FROM site_history ORDER BY rowid DESC LIMIT 50').all().map(r => ({ id: r.id, version: r.version, config: validateSiteConfig(JSON.parse(r.config as string)), note: r.note, createdAt: r.created_at })) as SiteHistoryEntry[];
  const activity = db.prepare('SELECT * FROM site_activity ORDER BY rowid DESC LIMIT 100').all().map(r => ({ id: r.id, action: r.action, detail: r.detail, createdAt: r.created_at })) as SiteActivityEntry[];
  return { version: row.version, draft: validateSiteConfig(JSON.parse(row.draft)), published: validateSiteConfig(JSON.parse(row.published)), history, activity, local: true };
}
export function readLocalPublished(): SiteConfig {
  const row = db.prepare('SELECT published FROM site_state WHERE id=1').get() as { published: string };
  return validateSiteConfig(JSON.parse(row.published));
}
export function mutateLocalSettings(operation: 'save' | 'publish' | 'restore', config: SiteConfig | null, expectedVersion: number, note: string, historyId: string | null): number {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('VERSION_CONFLICT');
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT * FROM site_state WHERE id=1').get() as { version: number; draft: string; published: string };
    if (row.version !== expectedVersion) throw new Error('VERSION_CONFLICT');
    const version = row.version + 1;
    if (operation === 'save') {
      if (!config) throw new Error('INVALID_SITE_CONFIG');
      db.prepare('UPDATE site_state SET draft=?,version=? WHERE id=1').run(JSON.stringify(validateSiteConfig(config)), version);
    } else if (operation === 'publish') {
      validateSiteConfig(JSON.parse(row.draft));
      db.prepare('UPDATE site_state SET published=draft,version=? WHERE id=1').run(version);
      db.prepare('INSERT INTO site_history VALUES (?,?,?,?,?)').run(randomUUID(), version, row.draft, note.slice(0, 300), new Date().toISOString());
    } else {
      const old = db.prepare('SELECT config FROM site_history WHERE id=?').get(historyId ?? '') as { config: string } | undefined;
      if (!old) throw new Error('NOT_FOUND');
      const restored = validateSiteConfig(JSON.parse(old.config));
      db.prepare('UPDATE site_state SET draft=?,version=? WHERE id=1').run(JSON.stringify(restored), version);
    }
    appendLocalActivity(operation, operation === 'publish' ? note || 'Published website settings' : operation === 'restore' ? `Restored revision ${historyId} to draft` : 'Saved website draft');
    db.exec('COMMIT');
    return version;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function saveLocalAsset(asset: SiteAsset) { db.prepare('INSERT INTO site_assets VALUES (?,?)').run(asset.id, JSON.stringify(asset)); }
export function readLocalAsset(id: string): SiteAsset | null {
  const row = db.prepare('SELECT data FROM site_assets WHERE id=?').get(id) as { data: string } | undefined;
  return row ? JSON.parse(row.data) as SiteAsset : null;
}
