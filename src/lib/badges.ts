import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/ui';
import { BOOKS, TOTAL_CHAPTERS } from '@/data/books';
import { getAllReadCounts, getReadingStats } from './data';
import { countCompletedPlans } from './plans';

export type Badge = {
  id: string;
  icon: IconName;
  current: number;
  target: number;
  earned: boolean;
  group: 'habit' | 'bible' | 'study';
};

type Def = Omit<Badge, 'current' | 'earned'> & { value: (s: Snapshot) => number };

type Snapshot = {
  streak: number;
  best: number;
  totalReads: number;
  distinct: number;
  readingDays: number;
  booksDone: number;
  booksDoneSet: Set<number>;
  ntDone: number;
  otDone: number;
  completions: number;
  highlights: number;
  wordHighlights: number;
  notes: number;
  topics: number;
  bookmarks: number;
  plansDone: number;
};

const has = (s: Snapshot, books: number[]) => books.filter((b) => s.booksDoneSet.has(b)).length;
const GOSPELS = [40, 41, 42, 43];
const PAUL = [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const DEFS: Def[] = [
  // Habit
  { id: 'first-chapter', group: 'habit', icon: 'sparkles', target: 1, value: (s) => s.totalReads },
  { id: 'streak-3', group: 'habit', icon: 'flame-outline', target: 3, value: (s) => s.best },
  { id: 'streak-7', group: 'habit', icon: 'flame', target: 7, value: (s) => s.best },
  { id: 'streak-30', group: 'habit', icon: 'bonfire-outline', target: 30, value: (s) => s.best },
  { id: 'streak-100', group: 'habit', icon: 'bonfire', target: 100, value: (s) => s.best },
  { id: 'streak-365', group: 'habit', icon: 'sunny', target: 365, value: (s) => s.best },
  { id: 'reads-50', group: 'habit', icon: 'library-outline', target: 50, value: (s) => s.totalReads },
  { id: 'reads-250', group: 'habit', icon: 'library', target: 250, value: (s) => s.totalReads },
  { id: 'reads-1000', group: 'habit', icon: 'trophy-outline', target: 1000, value: (s) => s.totalReads },
  { id: 'plan-1', group: 'habit', icon: 'flag', target: 1, value: (s) => s.plansDone },
  // Bible
  { id: 'book-1', group: 'bible', icon: 'book-outline', target: 1, value: (s) => s.booksDone },
  { id: 'gospels', group: 'bible', icon: 'heart', target: 4, value: (s) => has(s, GOSPELS) },
  { id: 'torah', group: 'bible', icon: 'document-text-outline', target: 5, value: (s) => has(s, range(1, 5)) },
  { id: 'psalms', group: 'bible', icon: 'musical-notes', target: 1, value: (s) => has(s, [19]) },
  { id: 'proverbs', group: 'bible', icon: 'bulb-outline', target: 1, value: (s) => has(s, [20]) },
  { id: 'paul', group: 'bible', icon: 'mail-outline', target: 13, value: (s) => has(s, PAUL) },
  { id: 'nt', group: 'bible', icon: 'star-half', target: 260, value: (s) => s.ntDone },
  { id: 'ot', group: 'bible', icon: 'star-half-outline', target: 929, value: (s) => s.otDone },
  { id: 'bible-1', group: 'bible', icon: 'star', target: TOTAL_CHAPTERS, value: (s) => s.distinct },
  { id: 'bible-2', group: 'bible', icon: 'ribbon', target: 2, value: (s) => s.completions },
  // Study
  { id: 'highlight-1', group: 'study', icon: 'color-palette-outline', target: 1, value: (s) => s.highlights },
  { id: 'highlight-50', group: 'study', icon: 'color-palette', target: 50, value: (s) => s.highlights },
  { id: 'words', group: 'study', icon: 'color-wand', target: 10, value: (s) => s.wordHighlights },
  { id: 'note-1', group: 'study', icon: 'create-outline', target: 1, value: (s) => s.notes },
  { id: 'note-25', group: 'study', icon: 'create', target: 25, value: (s) => s.notes },
  { id: 'topic-3', group: 'study', icon: 'pricetags', target: 3, value: (s) => s.topics },
  { id: 'bookmark-10', group: 'study', icon: 'bookmarks', target: 10, value: (s) => s.bookmarks },
];

async function count(db: SQLiteDatabase, sql: string) {
  return (await db.getFirstAsync<{ c: number }>(sql))?.c ?? 0;
}

export async function getBadges(db: SQLiteDatabase): Promise<Badge[]> {
  const [stats, counts] = await Promise.all([getReadingStats(db), getAllReadCounts(db)]);
  const booksDoneSet = new Set<number>();
  let ntDone = 0;
  let otDone = 0;
  for (const b of BOOKS) {
    let done = 0;
    for (let c = 1; c <= b.chapters; c++) if (counts.get(`${b.n}:${c}`)) done++;
    if (done === b.chapters) booksDoneSet.add(b.n);
    if (b.testament === 'NT') ntDone += done;
    else otDone += done;
  }
  const snap: Snapshot = {
    streak: stats.streak,
    best: stats.bestStreak,
    totalReads: stats.totalReads,
    distinct: counts.size,
    readingDays: stats.days.size,
    booksDone: booksDoneSet.size,
    booksDoneSet,
    ntDone,
    otDone,
    completions: counts.size === TOTAL_CHAPTERS ? Math.min(...counts.values()) : 0,
    highlights: await count(db, 'SELECT COUNT(*) AS c FROM highlights'),
    wordHighlights: await count(
      db,
      "SELECT COUNT(*) AS c FROM (SELECT DISTINCT book, ch, v FROM highlights WHERE start IS NOT NULL)"
    ),
    notes: await count(db, 'SELECT COUNT(*) AS c FROM notes'),
    topics: await count(db, 'SELECT COUNT(*) AS c FROM topics'),
    bookmarks: await count(db, 'SELECT COUNT(*) AS c FROM bookmarks'),
    plansDone: await countCompletedPlans(db),
  };
  return DEFS.map(({ value, ...d }) => {
    const current = Math.min(d.target, value(snap));
    return { ...d, current, earned: current >= d.target };
  });
}
