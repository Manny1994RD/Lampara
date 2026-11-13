import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'lampara.db';
const SCHEMA_VERSION = 2;

/** Runs once when the database opens. Creates / upgrades tables. */
export async function migrateDb(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        abbr TEXT NOT NULL,
        lang TEXT NOT NULL,
        comments TEXT,
        verse_count INTEGER NOT NULL DEFAULT 0,
        has_ot INTEGER NOT NULL DEFAULT 1,
        has_nt INTEGER NOT NULL DEFAULT 1,
        source_file TEXT,
        imported_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS verses (
        tr TEXT NOT NULL,
        book INTEGER NOT NULL,
        ch INTEGER NOT NULL,
        v INTEGER NOT NULL,
        text TEXT NOT NULL,
        norm TEXT NOT NULL,
        marks TEXT,
        para INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tr, book, ch, v)
      ) WITHOUT ROWID;

      -- Every time a chapter is marked as read (re-reads add more rows).
      CREATE TABLE IF NOT EXISTS chapter_reads (
        id TEXT PRIMARY KEY NOT NULL,
        book INTEGER NOT NULL,
        ch INTEGER NOT NULL,
        tr TEXT,
        day TEXT NOT NULL,          -- local date YYYY-MM-DD
        read_at TEXT NOT NULL       -- ISO timestamp
      );
      CREATE INDEX IF NOT EXISTS idx_reads_chapter ON chapter_reads(book, ch);
      CREATE INDEX IF NOT EXISTS idx_reads_day ON chapter_reads(day);

      -- Highlights. tr/start/end are NULL for whole-verse highlights (shown in every translation).
      -- Word highlights store the translation + character range inside that verse's text.
      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY NOT NULL,
        book INTEGER NOT NULL,
        ch INTEGER NOT NULL,
        v INTEGER NOT NULL,
        tr TEXT,
        start INTEGER,
        "end" INTEGER,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hl_chapter ON highlights(book, ch);

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY NOT NULL,
        book INTEGER NOT NULL,
        ch INTEGER NOT NULL,
        v INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (book, ch, v)
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY NOT NULL,
        book INTEGER NOT NULL,
        ch INTEGER NOT NULL,
        v INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (book, ch, v)
      );

      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS topic_verses (
        topic_id TEXT NOT NULL,
        book INTEGER NOT NULL,
        ch INTEGER NOT NULL,
        v INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (topic_id, book, ch, v)
      );
    `);
  }

  if (current < 2) {
    await db.execAsync(`
      -- Reading plans. A chapter counts as done when it was marked read on/after the plan's start.
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        books TEXT,                 -- JSON array of book numbers (custom plans)
        days INTEGER NOT NULL,
        start_day TEXT NOT NULL,    -- YYYY-MM-DD
        started_at TEXT NOT NULL,   -- ISO timestamp
        status TEXT NOT NULL DEFAULT 'active',  -- active | done | archived
        completed_at TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/* ------------------------------------------------------------------ */
/* Change notifications: screens re-query when data they use changes. */
/* ------------------------------------------------------------------ */

export type Topic = 'translations' | 'reads' | 'highlights' | 'bookmarks' | 'notes' | 'topics' | 'plans';
type Listener = (t: Topic) => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notify(t: Topic) {
  listeners.forEach((fn) => fn(t));
}

/* ------------------------------------------------------------------ */

export function newId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

export function nowIso() {
  return new Date().toISOString();
}

/** Local calendar day as YYYY-MM-DD. */
export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
