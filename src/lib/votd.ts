import type { SQLiteDatabase } from 'expo-sqlite';

import { refLabel, type Lang } from '@/data/books';
import { votdForDate } from '@/data/votd';
import { getVerseTexts, refKey } from './data';

export type Votd = { book: number; ch: number; v1: number; v2: number; label: string; text: string };

/** Verse of the day for a date, with text from the given translation (empty text if not available). */
export async function getVotd(db: SQLiteDatabase, tr: string | null, lang: Lang, date = new Date()): Promise<Votd> {
  const ref = votdForDate(date);
  const label =
    refLabel(ref.book, ref.ch, ref.v1, lang) + (ref.v2 > ref.v1 ? `–${ref.v2}` : '');
  if (!tr) return { ...ref, label, text: '' };
  const refs = Array.from({ length: ref.v2 - ref.v1 + 1 }, (_, i) => ({ book: ref.book, ch: ref.ch, v: ref.v1 + i }));
  // getVerseTexts also asks your hub for Bibles that aren't fully on this device.
  const texts = await getVerseTexts(db, tr, refs);
  const text = refs
    .map((r) => texts.get(refKey(r)))
    .filter(Boolean)
    .join(' ');
  return { ...ref, label, text };
}
