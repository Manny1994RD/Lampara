import { BOOKS } from './books';

export type ChapterRef = { book: number; ch: number };

/** [book, firstChapter, lastChapter] */
type Segment = [number, number, number];

const whole = (book: number): Segment => [book, 1, BOOKS[book - 1].chapters];

/**
 * Approximate historical order of events/writing, at chapter-range level.
 * (Job after the early chapters of Genesis, Psalms with David's life, prophets with Kings,
 * epistles placed inside the story of Acts.)
 */
const CHRONOLOGICAL: Segment[] = [
  [1, 1, 11], whole(18), [1, 12, 50],
  whole(2), whole(3), whole(4), whole(5), [19, 90, 90],
  whole(6), whole(7), whole(8),
  [9, 1, 15], [9, 16, 31], [19, 1, 41],
  whole(10), whole(13), [19, 42, 89], [19, 91, 150],
  [11, 1, 4], whole(20), whole(22), [11, 5, 11], whole(21), [14, 1, 9],
  [11, 12, 22], [14, 10, 20],
  [12, 1, 14], whole(29), whole(32), whole(30), whole(28),
  [14, 21, 28], [23, 1, 39], whole(33), [12, 15, 20], [14, 29, 32], [23, 40, 66],
  [12, 21, 23], [14, 33, 35], whole(34), whole(36), whole(35),
  [24, 1, 29], [12, 24, 25], [14, 36, 36], [24, 30, 52], whole(25), whole(31),
  whole(26), whole(27),
  [15, 1, 6], whole(37), whole(38), whole(17), [15, 7, 10], whole(16), whole(39),
  // New Testament
  whole(40), whole(41), whole(42), whole(43),
  [44, 1, 12], whole(59), [44, 13, 14], whole(48), [44, 15, 17], whole(52), whole(53),
  [44, 18, 19], whole(46), whole(47), whole(45), [44, 20, 28],
  whole(49), whole(50), whole(51), whole(57), whole(54), whole(56), whole(60),
  whole(58), whole(55), whole(61), whole(65),
  whole(62), whole(63), whole(64), whole(66),
];

function expand(segments: Segment[]): ChapterRef[] {
  const out: ChapterRef[] = [];
  for (const [book, a, b] of segments) for (let ch = a; ch <= b; ch++) out.push({ book, ch });
  return out;
}

export type PlanKind = 'canonical' | 'chronological' | 'nt' | 'ot' | 'gospels' | 'psalms-proverbs' | 'custom';

export const PLAN_KINDS: { kind: Exclude<PlanKind, 'custom'>; en: string; es: string; days: number; descEn: string; descEs: string }[] = [
  { kind: 'chronological', en: 'Chronological', es: 'Cronológico', days: 365, descEn: 'The whole Bible in the order events happened.', descEs: 'Toda la Biblia en el orden en que ocurrieron los hechos.' },
  { kind: 'canonical', en: 'Genesis to Revelation', es: 'De Génesis a Apocalipsis', days: 365, descEn: 'The whole Bible in book order.', descEs: 'Toda la Biblia en el orden de los libros.' },
  { kind: 'nt', en: 'New Testament', es: 'Nuevo Testamento', days: 90, descEn: 'Matthew to Revelation.', descEs: 'De Mateo a Apocalipsis.' },
  { kind: 'ot', en: 'Old Testament', es: 'Antiguo Testamento', days: 270, descEn: 'Genesis to Malachi.', descEs: 'De Génesis a Malaquías.' },
  { kind: 'gospels', en: 'The Gospels', es: 'Los Evangelios', days: 30, descEn: 'Matthew, Mark, Luke and John.', descEs: 'Mateo, Marcos, Lucas y Juan.' },
  { kind: 'psalms-proverbs', en: 'Psalms & Proverbs', es: 'Salmos y Proverbios', days: 60, descEn: 'Wisdom and prayer.', descEs: 'Sabiduría y oración.' },
];

/** Ordered chapter list for a plan. `books` is used for custom plans (in the order given). */
export function planChapters(kind: PlanKind, books: number[] = []): ChapterRef[] {
  switch (kind) {
    case 'chronological':
      return expand(CHRONOLOGICAL);
    case 'canonical':
      return expand(BOOKS.map((b) => whole(b.n)));
    case 'nt':
      return expand(BOOKS.filter((b) => b.n >= 40).map((b) => whole(b.n)));
    case 'ot':
      return expand(BOOKS.filter((b) => b.n <= 39).map((b) => whole(b.n)));
    case 'gospels':
      return expand([whole(40), whole(41), whole(42), whole(43)]);
    case 'psalms-proverbs':
      return expand([whole(19), whole(20)]);
    case 'custom':
      return expand(books.map(whole));
  }
}

/** Splits the chapter list evenly over `days` days. */
export function splitIntoDays(chapters: ChapterRef[], days: number): ChapterRef[][] {
  const n = Math.max(1, Math.min(days, chapters.length));
  const out: ChapterRef[][] = [];
  for (let i = 0; i < n; i++) {
    out.push(chapters.slice(Math.floor((i * chapters.length) / n), Math.floor(((i + 1) * chapters.length) / n)));
  }
  return out;
}

/** Sanity check used by tests: every chapter appears exactly once in the chronological order. */
export function validateChronological() {
  const seen = new Map<string, number>();
  for (const c of expand(CHRONOLOGICAL)) seen.set(`${c.book}:${c.ch}`, (seen.get(`${c.book}:${c.ch}`) ?? 0) + 1);
  const missing: string[] = [];
  const dupes: string[] = [];
  for (const b of BOOKS)
    for (let ch = 1; ch <= b.chapters; ch++) {
      const k = `${b.n}:${ch}`;
      const n = seen.get(k) ?? 0;
      if (n === 0) missing.push(k);
      if (n > 1) dupes.push(k);
    }
  return { total: expand(CHRONOLOGICAL).length, missing, dupes };
}
