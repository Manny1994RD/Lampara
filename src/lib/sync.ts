import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { SYNC_TABLES, notify, nowIso, type Topic } from './db';
import { getHub, hubFetch, HubError } from './hub';

/** Columns that are synced for each kind (everything the row needs to be rebuilt). */
const COLUMNS: Record<string, string[]> = {
  reads: ['id', 'book', 'ch', 'tr', 'day', 'read_at'],
  highlights: ['id', 'book', 'ch', 'v', 'tr', 'start', 'end', 'color', 'created_at'],
  bookmarks: ['id', 'book', 'ch', 'v', 'created_at'],
  notes: ['id', 'book', 'ch', 'v', 'body', 'created_at', 'updated_at'],
  topics: ['id', 'name', 'color', 'created_at'],
  topic_verses: ['topic_id', 'book', 'ch', 'v', 'created_at'],
  plans: ['id', 'name', 'kind', 'books', 'days', 'start_day', 'started_at', 'status', 'completed_at', 'created_at'],
};

const TOPIC_OF: Record<string, Topic> = {
  reads: 'reads',
  highlights: 'highlights',
  bookmarks: 'bookmarks',
  notes: 'notes',
  topics: 'topics',
  topic_verses: 'topics',
  plans: 'plans',
};

const table = (kind: string) => SYNC_TABLES.find((t) => t.kind === kind)!.table;
const quote = (c: string) => `"${c}"`;

function whereForItem(kind: string, itemId: string): [string, (string | number)[]] {
  if (kind === 'topic_verses') {
    const [topic, book, ch, v] = itemId.split(':');
    return ['topic_id = ? AND book = ? AND ch = ? AND v = ?', [topic, Number(book), Number(ch), Number(v)]];
  }
  return ['id = ?', [itemId]];
}

type PushItem = { kind: string; item_id: string; data?: Record<string, unknown>; deleted?: boolean };
type PullResponse = { items: PushItem[]; cursor: number; more: boolean };

export type SyncResult = { pushed: number; pulled: number };

let running: Promise<SyncResult> | null = null;

/** What the last sync did, for the "Synced / Waiting for connection" label. */
export type SyncPhase = 'syncing' | 'synced' | 'offline' | 'error' | 'idle';
let phase: SyncPhase = 'idle';
const phaseListeners = new Set<() => void>();
function setPhase(p: SyncPhase) {
  if (p === phase) return;
  phase = p;
  phaseListeners.forEach((l) => l());
}
export function useSyncPhase(): SyncPhase {
  return useSyncExternalStore(
    (cb) => {
      phaseListeners.add(cb);
      return () => phaseListeners.delete(cb);
    },
    () => phase,
    () => phase
  );
}

/** Push local changes, then pull everything new from the hub. Safe to call often. */
export function syncNow(db: SQLiteDatabase): Promise<SyncResult> {
  if (!getHub()) return Promise.resolve({ pushed: 0, pulled: 0 });
  if (!running) {
    setPhase('syncing');
    running = doSync(db)
      .then(
        (r) => {
          setPhase('synced');
          return r;
        },
        (e) => {
          setPhase(e instanceof HubError && e.status === 0 ? 'offline' : 'error');
          throw e;
        }
      )
      .finally(() => (running = null));
  }
  return running;
}

/** After signing in: send everything already on this device to the hub. */
export async function markAllForUpload(db: SQLiteDatabase) {
  for (const t of SYNC_TABLES) {
    await db.runAsync(
      `INSERT INTO outbox (kind, item_id, ver) SELECT '${t.kind}', ${t.idExpr('NEW').replace(/NEW\./g, '')}, 1 FROM ${t.table} WHERE 1
       ON CONFLICT (kind, item_id) DO UPDATE SET ver = ver + 1`
    );
  }
}

/** On sign out: forget the sync position (the local data stays). */
export async function resetSyncState(db: SQLiteDatabase) {
  await db.runAsync('UPDATE sync_meta SET cursor = 0, last_sync = NULL WHERE id = 1');
  await db.runAsync('DELETE FROM outbox');
}

export async function getSyncInfo(db: SQLiteDatabase) {
  const meta = await db.getFirstAsync<{ last_sync: string | null }>('SELECT last_sync FROM sync_meta WHERE id = 1');
  const pending = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
  return { lastSync: meta?.last_sync ?? null, pending: pending?.c ?? 0 };
}

async function doSync(db: SQLiteDatabase): Promise<SyncResult> {
  let pushed = 0;
  let pulled = 0;
  const changed = new Set<Topic>();
  let cursor = (await db.getFirstAsync<{ cursor: number }>('SELECT cursor FROM sync_meta WHERE id = 1'))?.cursor ?? 0;

  for (let round = 0; round < 50; round++) {
    // 1. Gather up to 400 local changes.
    const dirty = await db.getAllAsync<{ kind: string; item_id: string; ver: number }>(
      'SELECT kind, item_id, ver FROM outbox LIMIT 400'
    );
    const push: PushItem[] = [];
    for (const d of dirty) {
      const cols = COLUMNS[d.kind];
      if (!cols) continue;
      const [where, params] = whereForItem(d.kind, d.item_id);
      const row = await db.getFirstAsync<Record<string, unknown>>(
        `SELECT ${cols.map(quote).join(', ')} FROM ${table(d.kind)} WHERE ${where}`,
        ...params
      );
      push.push(row ? { kind: d.kind, item_id: d.item_id, data: row } : { kind: d.kind, item_id: d.item_id, deleted: true });
    }

    // 2. Send them and receive what's new.
    const res = await hubFetch<PullResponse>('/api/lampara/sync', { method: 'POST', body: { push, cursor } });

    // 3. Clear what was sent (unless it changed again meanwhile).
    for (const d of dirty) {
      await db.runAsync('DELETE FROM outbox WHERE kind = ? AND item_id = ? AND ver = ?', d.kind, d.item_id, d.ver);
    }
    pushed += push.length;

    // 4. Apply incoming changes without re-recording them as local changes.
    if (res.items.length) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE sync_meta SET applying = 1 WHERE id = 1');
        try {
          for (const it of res.items) {
            const cols = COLUMNS[it.kind];
            if (!cols) continue;
            // Our own changes come back too; skip rows we've changed again since.
            const pending = await db.getFirstAsync('SELECT 1 FROM outbox WHERE kind = ? AND item_id = ?', it.kind, it.item_id);
            if (pending) continue;
            const [where, params] = whereForItem(it.kind, it.item_id);
            if (it.deleted || !it.data) {
              await db.runAsync(`DELETE FROM ${table(it.kind)} WHERE ${where}`, ...params);
            } else {
              const values = cols.map((c) => (it.data![c] ?? null) as string | number | null);
              await db.runAsync(
                `INSERT OR REPLACE INTO ${table(it.kind)} (${cols.map(quote).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
                ...values
              );
            }
            changed.add(TOPIC_OF[it.kind]);
          }
        } finally {
          await db.runAsync('UPDATE sync_meta SET applying = 0 WHERE id = 1');
        }
      });
      pulled += res.items.length;
    }
    cursor = res.cursor;
    await db.runAsync('UPDATE sync_meta SET cursor = ? WHERE id = 1', cursor);

    const remaining = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
    if (!res.more && (remaining?.c ?? 0) === 0) break;
  }

  await db.runAsync('UPDATE sync_meta SET last_sync = ? WHERE id = 1', nowIso());
  changed.forEach((t) => notify(t));
  notify('hub');
  return { pushed, pulled };
}
