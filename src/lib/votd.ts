import type { SQLiteDatabase } from 'expo-sqlite';

import { refLabel, type Lang } from '@/data/books';
import { votdForDate } from '@/data/votd';

export type Votd = { book: number; ch: number; v1: number; v2: number; label: string; text: string };

/** Verse of the day for a date, with text from the given translation (empty text if not available). */
export async function getVotd(db: SQLiteDatabase, tr: string | null, lang: Lang, date = new Date()): Promise<Votd> {
  const ref = votdForDate(date);
  const label =
    refLabel(ref.book, ref.ch, ref.v1, lang) + (ref.v2 > ref.v1 ? `–${ref.v2}` : '');
  if (!tr) return { ...ref, label, text: '' };
  const rows = await db.getAllAsync<{ text: string }>(
    'SELECT text FROM verses WHERE tr = ? AND book = ? AND ch = ? AND v BETWEEN ? AND ? ORDER BY v',
    tr,
    ref.book,
    ref.ch,
    ref.v1,
    ref.v2
  );
  return { ...ref, label, text: rows.map((r) => r.text).join(' ') };
}
