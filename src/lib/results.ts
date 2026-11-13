import type { SQLiteDatabase } from 'expo-sqlite';

import { TOTAL_CHAPTERS } from '@/data/books';
import { getReadingStats } from './data';
import { localDay } from './db';

export type Period = 'day' | 'week' | 'month';

export type PeriodResults = {
  period: Period;
  start: string; // YYYY-MM-DD
  end: string;
  chapters: number;
  daysRead: number;
  books: number[]; // distinct books read, most-read first
  highlights: number;
  notes: number;
  streak: number;
  biblePct: number;
  /** Chapters per day across the period (for the little bar chart). */
  perDay: { day: string; n: number }[];
};

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

export function periodRange(period: Period, today = localDay()) {
  if (period === 'day') return { start: today, end: today };
  if (period === 'week') return { start: addDays(today, -6), end: today };
  return { start: `${today.slice(0, 8)}01`, end: today };
}

export async function getPeriodResults(db: SQLiteDatabase, period: Period): Promise<PeriodResults> {
  const { start, end } = periodRange(period);
  // created_at / updated_at are ISO timestamps; compare against the local day boundaries.
  const startIso = new Date(`${start}T00:00:00`).toISOString();
  const endIso = new Date(`${addDays(end, 1)}T00:00:00`).toISOString();

  const [reads, days, books, hl, notes, distinct, stats] = await Promise.all([
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM chapter_reads WHERE day BETWEEN ? AND ?', start, end),
    db.getAllAsync<{ day: string; n: number }>(
      'SELECT day, COUNT(*) AS n FROM chapter_reads WHERE day BETWEEN ? AND ? GROUP BY day',
      start,
      end
    ),
    db.getAllAsync<{ book: number; n: number }>(
      'SELECT book, COUNT(*) AS n FROM chapter_reads WHERE day BETWEEN ? AND ? GROUP BY book ORDER BY n DESC, book',
      start,
      end
    ),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM highlights WHERE created_at >= ? AND created_at < ?', startIso, endIso),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE updated_at >= ? AND updated_at < ?', startIso, endIso),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM (SELECT DISTINCT book, ch FROM chapter_reads)'),
    getReadingStats(db),
  ]);

  const byDay = new Map(days.map((d) => [d.day, d.n]));
  const perDay: { day: string; n: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) perDay.push({ day: d, n: byDay.get(d) ?? 0 });

  return {
    period,
    start,
    end,
    chapters: reads?.n ?? 0,
    daysRead: days.length,
    books: books.map((b) => b.book),
    highlights: hl?.n ?? 0,
    notes: notes?.n ?? 0,
    streak: stats.streak,
    biblePct: (distinct?.n ?? 0) / TOTAL_CHAPTERS,
    perDay,
  };
}
