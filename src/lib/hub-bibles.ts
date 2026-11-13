import type { SQLiteDatabase } from 'expo-sqlite';

import { notify, nowIso } from './db';
import { getHub, hubFetch } from './hub';

/**
 * Bibles stored on your hub.
 *
 * - The hub owner uploads a Bible once (from any device where it was imported).
 * - Every signed-in device lists the hub's Bibles automatically.
 * - By default a device keeps only the chapters you read recently (CACHE_CHAPTERS);
 *   "Save offline" downloads the whole text, "Remove from device" frees the space again.
 */

export type HubBible = {
  id: string;
  name: string;
  abbr: string;
  lang: 'en' | 'es' | 'ko';
  comments: string;
  verse_count: number;
  has_ot: number;
  has_nt: number;
};
type HubVerse = { book: number; ch: number; v: number; text: string; norm: string; marks: string; para: number };
type TrInfo = { id: string; hub_id: string | null; offline: number };

/** How many recently read chapters a device keeps for Bibles it reads from the hub. */
const CACHE_CHAPTERS = 150;

export async function listHubBibles() {
  return hubFetch<{ items: HubBible[]; can_manage: boolean }>('/api/lampara/bibles');
}

function trInfo(db: SQLiteDatabase, tr: string) {
  return db.getFirstAsync<TrInfo>('SELECT id, hub_id, offline FROM translations WHERE id = ?', tr);
}

/** True when this translation is read from the hub (not fully stored on this device). */
export async function isStreaming(db: SQLiteDatabase, tr: string) {
  const info = await trInfo(db, tr);
  return !!info?.hub_id && !info.offline;
}

async function insertVerses(db: SQLiteDatabase, tr: string, verses: HubVerse[]) {
  for (let i = 0; i < verses.length; i += 100) {
    const chunk = verses.slice(i, i + 100);
    await db.runAsync(
      `INSERT OR REPLACE INTO verses (tr, book, ch, v, text, norm, marks, para) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
      chunk.flatMap((r) => [tr, r.book, r.ch, r.v, r.text, r.norm, r.marks || null, r.para ? 1 : 0])
    );
  }
}

/** Adds the hub's Bibles to this device's list (and drops ones removed from the hub). */
export async function refreshHubBibles(db: SQLiteDatabase) {
  if (!getHub()) return;
  const { items } = await listHubBibles();
  const local = await db.getAllAsync<TrInfo & { lang: string }>('SELECT id, hub_id, offline, lang FROM translations');
  const onHub = new Set(items.map((b) => b.id));
  let changed = false;

  for (const b of items) {
    const mine = local.find((l) => l.id === b.id);
    if (!mine) {
      await db.runAsync(
        `INSERT INTO translations (id, name, abbr, lang, comments, verse_count, has_ot, has_nt, source_file, imported_at, hub_id, offline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
        b.id,
        b.name,
        b.abbr,
        b.lang,
        b.comments,
        b.verse_count,
        b.has_ot,
        b.has_nt,
        nowIso(),
        b.id
      );
      changed = true;
    } else if (!mine.hub_id) {
      await db.runAsync('UPDATE translations SET hub_id = ? WHERE id = ?', b.id, b.id);
      changed = true;
    } else if (!mine.offline && mine.lang !== b.lang) {
      // The hub corrected the language.
      await db.runAsync('UPDATE translations SET lang = ? WHERE id = ?', b.lang, b.id);
      changed = true;
    }
  }
  for (const l of local) {
    if (!l.hub_id || onHub.has(l.hub_id)) continue;
    if (l.offline) {
      // Fully stored here: keep it as a normal Bible on this device.
      await db.runAsync('UPDATE translations SET hub_id = NULL WHERE id = ?', l.id);
    } else {
      await removeTranslationRows(db, l.id);
    }
    changed = true;
  }
  if (changed) notify('translations');
}

async function removeTranslationRows(db: SQLiteDatabase, tr: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM verses WHERE tr = ?', tr);
    await db.runAsync('DELETE FROM cached_chapters WHERE tr = ?', tr);
    await db.runAsync('DELETE FROM translations WHERE id = ?', tr);
  });
}

/** When signing out: Bibles that were only read from the hub can't be read anymore, so remove them. */
export async function forgetStreamingBibles(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM translations WHERE hub_id IS NOT NULL AND offline = 0');
  for (const r of rows) await removeTranslationRows(db, r.id);
  if (rows.length) notify('translations');
}

/**
 * Makes sure a chapter of a hub Bible is on this device (fetching it if needed).
 * Returns false when the chapter isn't available (offline, signed out, or not in this Bible).
 */
export async function ensureChapter(db: SQLiteDatabase, tr: string, book: number, ch: number): Promise<boolean> {
  const info = await trInfo(db, tr);
  if (!info?.hub_id || info.offline || !getHub()) return false;
  let verses: HubVerse[];
  try {
    verses = (await hubFetch<{ verses: HubVerse[] }>(`/api/lampara/bibles/${info.hub_id}/text?book=${book}&ch=${ch}`)).verses;
  } catch (e) {
    console.warn('chapter fetch failed', e instanceof Error ? e.message : e);
    return false;
  }
  if (!verses.length) return false;
  await db.withTransactionAsync(async () => {
    await insertVerses(db, tr, verses);
    await db.runAsync('INSERT OR REPLACE INTO cached_chapters (tr, book, ch, used_at) VALUES (?, ?, ?, ?)', tr, book, ch, nowIso());
  });
  await trimCache(db);
  return true;
}

/** Marks a cached chapter as recently used. */
export async function touchChapter(db: SQLiteDatabase, tr: string, book: number, ch: number) {
  await db.runAsync('UPDATE cached_chapters SET used_at = ? WHERE tr = ? AND book = ? AND ch = ?', nowIso(), tr, book, ch);
}

async function trimCache(db: SQLiteDatabase) {
  const old = await db.getAllAsync<{ tr: string; book: number; ch: number }>(
    `SELECT c.tr, c.book, c.ch FROM cached_chapters c JOIN translations t ON t.id = c.tr
     WHERE t.offline = 0 ORDER BY c.used_at DESC LIMIT -1 OFFSET ${CACHE_CHAPTERS}`
  );
  if (!old.length) return;
  await db.withTransactionAsync(async () => {
    for (const o of old) {
      await db.runAsync('DELETE FROM verses WHERE tr = ? AND book = ? AND ch = ?', o.tr, o.book, o.ch);
      await db.runAsync('DELETE FROM cached_chapters WHERE tr = ? AND book = ? AND ch = ?', o.tr, o.book, o.ch);
    }
  });
}

/** Single verses straight from the hub (for verse lists, verse of the day…). Not cached. */
export async function lookupHubVerses(db: SQLiteDatabase, tr: string, refs: { book: number; ch: number; v: number }[]) {
  const info = await trInfo(db, tr);
  if (!info?.hub_id || info.offline || !getHub() || refs.length === 0) return [];
  const out: { book: number; ch: number; v: number; text: string }[] = [];
  for (let i = 0; i < refs.length; i += 500) {
    const res = await hubFetch<{ verses: typeof out }>(`/api/lampara/bibles/${info.hub_id}/lookup`, {
      method: 'POST',
      body: { refs: refs.slice(i, i + 500).map((r) => [r.book, r.ch, r.v]) },
    });
    out.push(...res.verses);
  }
  return out;
}

/** Search a hub Bible on the hub (words must already be normalized). */
export async function searchHubBible(db: SQLiteDatabase, tr: string, words: string[], scope: 'all' | 'OT' | 'NT', limit: number) {
  const info = await trInfo(db, tr);
  if (!info?.hub_id || !getHub()) return [];
  const q = new URLSearchParams({ words: words.join(' '), scope, limit: String(limit) });
  return (await hubFetch<{ verses: { book: number; ch: number; v: number; text: string }[] }>(`/api/lampara/bibles/${info.hub_id}/search?${q}`))
    .verses;
}

export type Progress = (done: number, total: number) => void;

/** Uploads a Bible from this device to the hub (hub owner only). */
export async function uploadBible(db: SQLiteDatabase, tr: string, onProgress?: Progress) {
  const t = await db.getFirstAsync<HubBible>(
    'SELECT id, name, abbr, lang, comments, verse_count, has_ot, has_nt FROM translations WHERE id = ?',
    tr
  );
  if (!t) throw new Error('Bible not found on this device.');
  await hubFetch('/api/lampara/bibles', { method: 'POST', body: { ...t, comments: t.comments ?? '' } });
  const PAGE = 3000;
  for (let off = 0; ; off += PAGE) {
    const rows = await db.getAllAsync<HubVerse>(
      `SELECT book, ch, v, text, norm, COALESCE(marks, '') AS marks, para FROM verses WHERE tr = ? ORDER BY book, ch, v LIMIT ${PAGE} OFFSET ${off}`,
      tr
    );
    if (!rows.length) break;
    await hubFetch(`/api/lampara/bibles/${tr}/verses`, {
      method: 'POST',
      body: { verses: rows.map((r) => [r.book, r.ch, r.v, r.text, r.norm, r.marks, r.para]) },
    });
    onProgress?.(Math.min(off + rows.length, t.verse_count), t.verse_count);
    if (rows.length < PAGE) break;
  }
  await hubFetch(`/api/lampara/bibles/${tr}/finish`, { method: 'POST' });
  await db.runAsync('UPDATE translations SET hub_id = ? WHERE id = ?', tr, tr);
  notify('translations');
}

/** Downloads the whole text of a hub Bible so it works without internet. */
export async function saveOffline(db: SQLiteDatabase, tr: string, onProgress?: Progress) {
  const info = await db.getFirstAsync<TrInfo & { has_ot: number; has_nt: number }>(
    'SELECT id, hub_id, offline, has_ot, has_nt FROM translations WHERE id = ?',
    tr
  );
  if (!info?.hub_id) return;
  const books = Array.from({ length: 66 }, (_, i) => i + 1).filter((b) => (b <= 39 ? info.has_ot : info.has_nt));
  for (let i = 0; i < books.length; i++) {
    const { verses } = await hubFetch<{ verses: HubVerse[] }>(`/api/lampara/bibles/${info.hub_id}/text?book=${books[i]}`);
    await db.withTransactionAsync(() => insertVerses(db, tr, verses));
    onProgress?.(i + 1, books.length);
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cached_chapters WHERE tr = ?', tr);
    await db.runAsync('UPDATE translations SET offline = 1 WHERE id = ?', tr);
  });
  notify('translations');
}

/** Frees the space a hub Bible uses on this device (it's still readable while online). */
export async function removeFromDevice(db: SQLiteDatabase, tr: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM verses WHERE tr = ?', tr);
    await db.runAsync('DELETE FROM cached_chapters WHERE tr = ?', tr);
    await db.runAsync('UPDATE translations SET offline = 0 WHERE id = ? AND hub_id IS NOT NULL', tr);
  });
  notify('translations');
}

/** Deletes a Bible from the hub (owner only) and from this device. */
export async function deleteFromHub(db: SQLiteDatabase, tr: string) {
  const info = await trInfo(db, tr);
  if (!info?.hub_id) return;
  await hubFetch(`/api/lampara/bibles/${info.hub_id}`, { method: 'DELETE' });
  await removeTranslationRows(db, tr);
  await db.runAsync('DELETE FROM highlights WHERE tr = ?', tr);
  notify('translations');
  notify('highlights');
}
