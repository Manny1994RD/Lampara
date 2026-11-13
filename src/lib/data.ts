import type { SQLiteDatabase } from 'expo-sqlite';

import type { HighlightColor } from '@/constants/theme';
import { localDay, newId, notify, nowIso } from './db';
import type { Mark } from './esword';
import { normalizeForSearch } from './esword';

export type Translation = {
  id: string;
  name: string;
  abbr: string;
  lang: 'en' | 'es';
  comments: string | null;
  verse_count: number;
  has_ot: number;
  has_nt: number;
  source_file: string | null;
  imported_at: string;
};

export type Verse = { book: number; ch: number; v: number; text: string; marks: Mark[]; para: boolean };

export type Highlight = {
  id: string;
  book: number;
  ch: number;
  v: number;
  tr: string | null;
  start: number | null;
  end: number | null;
  color: HighlightColor;
  created_at: string;
};

export type Note = { id: string; book: number; ch: number; v: number; body: string; updated_at: string };
export type TopicRow = { id: string; name: string; color: HighlightColor; count: number };
export type VerseRef = { book: number; ch: number; v: number };

/* ----------------------------- translations ----------------------------- */

export function getTranslations(db: SQLiteDatabase) {
  return db.getAllAsync<Translation>('SELECT * FROM translations ORDER BY lang, name');
}

/* ------------------------------- reading -------------------------------- */

export async function getChapter(db: SQLiteDatabase, tr: string, book: number, ch: number): Promise<Verse[]> {
  const rows = await db.getAllAsync<{ book: number; ch: number; v: number; text: string; marks: string | null; para: number }>(
    'SELECT book, ch, v, text, marks, para FROM verses WHERE tr = ? AND book = ? AND ch = ? ORDER BY v',
    tr,
    book,
    ch
  );
  return rows.map((r) => ({ ...r, marks: r.marks ? JSON.parse(r.marks) : [], para: !!r.para }));
}

export async function getVerseTexts(db: SQLiteDatabase, tr: string | null, refs: VerseRef[]) {
  const map = new Map<string, string>();
  if (!tr || refs.length === 0) return map;
  // Query in chunks to stay under parameter limits.
  for (let i = 0; i < refs.length; i += 150) {
    const chunk = refs.slice(i, i + 150);
    const where = chunk.map(() => '(book = ? AND ch = ? AND v = ?)').join(' OR ');
    const params = chunk.flatMap((r) => [r.book, r.ch, r.v]);
    const rows = await db.getAllAsync<{ book: number; ch: number; v: number; text: string }>(
      `SELECT book, ch, v, text FROM verses WHERE tr = ? AND (${where})`,
      tr,
      ...params
    );
    rows.forEach((r) => map.set(refKey(r), r.text));
  }
  return map;
}

export const refKey = (r: VerseRef) => `${r.book}:${r.ch}:${r.v}`;

/* ------------------------------- tracker -------------------------------- */

export async function markChapterRead(db: SQLiteDatabase, book: number, ch: number, tr: string | null) {
  await db.runAsync(
    'INSERT INTO chapter_reads (id, book, ch, tr, day, read_at) VALUES (?, ?, ?, ?, ?, ?)',
    newId(),
    book,
    ch,
    tr,
    localDay(),
    nowIso()
  );
  notify('reads');
}

export async function undoLastRead(db: SQLiteDatabase, book: number, ch: number) {
  await db.runAsync(
    `DELETE FROM chapter_reads WHERE id = (
       SELECT id FROM chapter_reads WHERE book = ? AND ch = ? ORDER BY read_at DESC LIMIT 1)`,
    book,
    ch
  );
  notify('reads');
}

export async function getChapterReadCount(db: SQLiteDatabase, book: number, ch: number) {
  const r = await db.getFirstAsync<{ c: number; last: string | null }>(
    'SELECT COUNT(*) AS c, MAX(read_at) AS last FROM chapter_reads WHERE book = ? AND ch = ?',
    book,
    ch
  );
  return { count: r?.c ?? 0, last: r?.last ?? null };
}

/** Map "book:ch" -> times read. */
export async function getAllReadCounts(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ book: number; ch: number; c: number }>(
    'SELECT book, ch, COUNT(*) AS c FROM chapter_reads GROUP BY book, ch'
  );
  const map = new Map<string, number>();
  rows.forEach((r) => map.set(`${r.book}:${r.ch}`, r.c));
  return map;
}

export type ReadingStats = {
  totalReads: number;
  todayReads: number;
  streak: number;
  bestStreak: number;
  days: Map<string, number>; // day -> chapters read
  lastRead: { book: number; ch: number; read_at: string } | null;
};

export async function getReadingStats(db: SQLiteDatabase): Promise<ReadingStats> {
  const dayRows = await db.getAllAsync<{ day: string; c: number }>(
    'SELECT day, COUNT(*) AS c FROM chapter_reads GROUP BY day ORDER BY day'
  );
  const days = new Map(dayRows.map((r) => [r.day, r.c]));
  const totalReads = dayRows.reduce((s, r) => s + r.c, 0);
  const today = localDay();
  const todayReads = days.get(today) ?? 0;

  // Current streak: consecutive days ending today (or yesterday, if today isn't done yet).
  const d = new Date();
  if (!days.has(today)) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(localDay(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  let bestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const r of dayRows) {
    const cur = new Date(`${r.day}T12:00:00`);
    if (prev && Math.round((cur.getTime() - prev.getTime()) / 86400000) === 1) run++;
    else run = 1;
    bestStreak = Math.max(bestStreak, run);
    prev = cur;
  }

  const lastRead = await db.getFirstAsync<{ book: number; ch: number; read_at: string }>(
    'SELECT book, ch, read_at FROM chapter_reads ORDER BY read_at DESC LIMIT 1'
  );
  return { totalReads, todayReads, streak, bestStreak, days, lastRead: lastRead ?? null };
}

/* ------------------------------ highlights ------------------------------ */

export function getChapterHighlights(db: SQLiteDatabase, book: number, ch: number) {
  return db.getAllAsync<Highlight>(
    'SELECT * FROM highlights WHERE book = ? AND ch = ? ORDER BY created_at',
    book,
    ch
  );
}

/** Whole-verse highlight (visible in every translation). Replaces the previous whole-verse color. */
export async function setVerseHighlight(db: SQLiteDatabase, refs: VerseRef[], color: HighlightColor | null) {
  await db.withTransactionAsync(async () => {
    for (const r of refs) {
      await db.runAsync(
        'DELETE FROM highlights WHERE book = ? AND ch = ? AND v = ? AND start IS NULL',
        r.book,
        r.ch,
        r.v
      );
      if (color) {
        await db.runAsync(
          'INSERT INTO highlights (id, book, ch, v, tr, start, "end", color, created_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)',
          newId(),
          r.book,
          r.ch,
          r.v,
          color,
          nowIso()
        );
      }
    }
  });
  notify('highlights');
}

/** Highlight only some words of a verse (stored for one translation). */
export async function addWordHighlight(
  db: SQLiteDatabase,
  ref: VerseRef,
  tr: string,
  start: number,
  end: number,
  color: HighlightColor
) {
  // Remove word highlights that overlap the new range.
  await db.runAsync(
    `DELETE FROM highlights WHERE book = ? AND ch = ? AND v = ? AND tr = ? AND start IS NOT NULL
       AND start < ? AND "end" > ?`,
    ref.book,
    ref.ch,
    ref.v,
    tr,
    end,
    start
  );
  await db.runAsync(
    'INSERT INTO highlights (id, book, ch, v, tr, start, "end", color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    newId(),
    ref.book,
    ref.ch,
    ref.v,
    tr,
    start,
    end,
    color,
    nowIso()
  );
  notify('highlights');
}

export async function clearWordHighlights(db: SQLiteDatabase, ref: VerseRef, tr: string) {
  await db.runAsync(
    'DELETE FROM highlights WHERE book = ? AND ch = ? AND v = ? AND tr = ? AND start IS NOT NULL',
    ref.book,
    ref.ch,
    ref.v,
    tr
  );
  notify('highlights');
}

export async function deleteHighlight(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM highlights WHERE id = ?', id);
  notify('highlights');
}

export function getAllHighlights(db: SQLiteDatabase) {
  return db.getAllAsync<Highlight>('SELECT * FROM highlights ORDER BY created_at DESC');
}

/* ------------------------------ bookmarks ------------------------------- */

export function getChapterBookmarks(db: SQLiteDatabase, book: number, ch: number) {
  return db.getAllAsync<{ v: number }>('SELECT v FROM bookmarks WHERE book = ? AND ch = ?', book, ch);
}

export async function toggleBookmark(db: SQLiteDatabase, ref: VerseRef) {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM bookmarks WHERE book = ? AND ch = ? AND v = ?',
    ref.book,
    ref.ch,
    ref.v
  );
  if (existing) await db.runAsync('DELETE FROM bookmarks WHERE id = ?', existing.id);
  else
    await db.runAsync(
      'INSERT INTO bookmarks (id, book, ch, v, created_at) VALUES (?, ?, ?, ?, ?)',
      newId(),
      ref.book,
      ref.ch,
      ref.v,
      nowIso()
    );
  notify('bookmarks');
  return !existing;
}

export function getAllBookmarks(db: SQLiteDatabase) {
  return db.getAllAsync<{ id: string; book: number; ch: number; v: number; created_at: string }>(
    'SELECT * FROM bookmarks ORDER BY created_at DESC'
  );
}

/* -------------------------------- notes --------------------------------- */

export function getChapterNotes(db: SQLiteDatabase, book: number, ch: number) {
  return db.getAllAsync<Note>('SELECT * FROM notes WHERE book = ? AND ch = ?', book, ch);
}

export async function saveNote(db: SQLiteDatabase, ref: VerseRef, body: string) {
  const text = body.trim();
  if (!text) {
    await db.runAsync('DELETE FROM notes WHERE book = ? AND ch = ? AND v = ?', ref.book, ref.ch, ref.v);
  } else {
    await db.runAsync(
      `INSERT INTO notes (id, book, ch, v, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(book, ch, v) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      newId(),
      ref.book,
      ref.ch,
      ref.v,
      text,
      nowIso(),
      nowIso()
    );
  }
  notify('notes');
}

export function getAllNotes(db: SQLiteDatabase) {
  return db.getAllAsync<Note>('SELECT * FROM notes ORDER BY updated_at DESC');
}

/* -------------------------------- topics -------------------------------- */

export function getTopics(db: SQLiteDatabase) {
  return db.getAllAsync<TopicRow>(
    `SELECT t.id, t.name, t.color, COUNT(tv.topic_id) AS count
       FROM topics t LEFT JOIN topic_verses tv ON tv.topic_id = t.id
      GROUP BY t.id ORDER BY t.name COLLATE NOCASE`
  );
}

export async function createTopic(db: SQLiteDatabase, name: string, color: HighlightColor) {
  const id = newId();
  await db.runAsync(
    'INSERT INTO topics (id, name, color, created_at) VALUES (?, ?, ?, ?)',
    id,
    name.trim(),
    color,
    nowIso()
  );
  notify('topics');
  return id;
}

export async function renameTopic(db: SQLiteDatabase, id: string, name: string, color: HighlightColor) {
  await db.runAsync('UPDATE topics SET name = ?, color = ? WHERE id = ?', name.trim(), color, id);
  notify('topics');
}

export async function deleteTopic(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM topic_verses WHERE topic_id = ?', id);
    await db.runAsync('DELETE FROM topics WHERE id = ?', id);
  });
  notify('topics');
}

export function getVerseTopicIds(db: SQLiteDatabase, ref: VerseRef) {
  return db.getAllAsync<{ topic_id: string }>(
    'SELECT topic_id FROM topic_verses WHERE book = ? AND ch = ? AND v = ?',
    ref.book,
    ref.ch,
    ref.v
  );
}

export async function setVerseInTopic(db: SQLiteDatabase, topicId: string, refs: VerseRef[], on: boolean) {
  await db.withTransactionAsync(async () => {
    for (const r of refs) {
      if (on)
        await db.runAsync(
          'INSERT OR IGNORE INTO topic_verses (topic_id, book, ch, v, created_at) VALUES (?, ?, ?, ?, ?)',
          topicId,
          r.book,
          r.ch,
          r.v,
          nowIso()
        );
      else
        await db.runAsync(
          'DELETE FROM topic_verses WHERE topic_id = ? AND book = ? AND ch = ? AND v = ?',
          topicId,
          r.book,
          r.ch,
          r.v
        );
    }
  });
  notify('topics');
}

export function getTopicVerses(db: SQLiteDatabase, topicId: string) {
  return db.getAllAsync<VerseRef & { created_at: string }>(
    'SELECT book, ch, v, created_at FROM topic_verses WHERE topic_id = ? ORDER BY book, ch, v',
    topicId
  );
}

/** Which verses of a chapter belong to at least one topic (for the little dot in the reader). */
export function getChapterTopicVerses(db: SQLiteDatabase, book: number, ch: number) {
  return db.getAllAsync<{ v: number; color: HighlightColor }>(
    `SELECT tv.v, t.color FROM topic_verses tv JOIN topics t ON t.id = tv.topic_id
      WHERE tv.book = ? AND tv.ch = ?`,
    book,
    ch
  );
}

/* -------------------------------- search -------------------------------- */

export async function searchVerses(
  db: SQLiteDatabase,
  tr: string,
  query: string,
  scope: 'all' | 'OT' | 'NT' = 'all',
  limit = 300
) {
  const words = normalizeForSearch(query)
    .split(/\s+/)
    .map((w) => w.replace(/[%_]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return [];
  const where = words.map(() => 'norm LIKE ?').join(' AND ');
  const scopeSql = scope === 'OT' ? ' AND book <= 39' : scope === 'NT' ? ' AND book >= 40' : '';
  return db.getAllAsync<{ book: number; ch: number; v: number; text: string }>(
    `SELECT book, ch, v, text FROM verses WHERE tr = ? AND ${where}${scopeSql} ORDER BY book, ch, v LIMIT ${limit}`,
    tr,
    ...words.map((w) => `%${w}%`)
  );
}
