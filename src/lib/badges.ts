import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/ui';
import { BOOKS, TOTAL_CHAPTERS } from '@/data/books';
import { getAllReadCounts, getReadingStats } from './data';
import { countCompletedPlans } from './plans';

export type Badge = {
  id: string;
  icon: IconName;
  en: string;
  es: string;
  descEn: string;
  descEs: string;
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
  { id: 'first-chapter', group: 'habit', icon: 'sparkles', en: 'First step', es: 'Primer paso', descEn: 'Mark your first chapter as read.', descEs: 'Marca tu primer capítulo como leído.', target: 1, value: (s) => s.totalReads },
  { id: 'streak-3', group: 'habit', icon: 'flame-outline', en: '3-day streak', es: 'Racha de 3 días', descEn: 'Read 3 days in a row.', descEs: 'Lee 3 días seguidos.', target: 3, value: (s) => s.best },
  { id: 'streak-7', group: 'habit', icon: 'flame', en: 'One week', es: 'Una semana', descEn: 'Read 7 days in a row.', descEs: 'Lee 7 días seguidos.', target: 7, value: (s) => s.best },
  { id: 'streak-30', group: 'habit', icon: 'bonfire-outline', en: 'One month', es: 'Un mes', descEn: 'A 30-day streak.', descEs: 'Una racha de 30 días.', target: 30, value: (s) => s.best },
  { id: 'streak-100', group: 'habit', icon: 'bonfire', en: '100 days', es: '100 días', descEn: 'A 100-day streak.', descEs: 'Una racha de 100 días.', target: 100, value: (s) => s.best },
  { id: 'streak-365', group: 'habit', icon: 'sunny', en: 'A whole year', es: 'Un año entero', descEn: 'A 365-day streak.', descEs: 'Una racha de 365 días.', target: 365, value: (s) => s.best },
  { id: 'reads-50', group: 'habit', icon: 'library-outline', en: '50 chapters', es: '50 capítulos', descEn: 'Read 50 chapters in total.', descEs: 'Lee 50 capítulos en total.', target: 50, value: (s) => s.totalReads },
  { id: 'reads-250', group: 'habit', icon: 'library', en: '250 chapters', es: '250 capítulos', descEn: 'Read 250 chapters in total.', descEs: 'Lee 250 capítulos en total.', target: 250, value: (s) => s.totalReads },
  { id: 'reads-1000', group: 'habit', icon: 'trophy-outline', en: '1,000 chapters', es: '1.000 capítulos', descEn: 'Read 1,000 chapters in total.', descEs: 'Lee 1.000 capítulos en total.', target: 1000, value: (s) => s.totalReads },
  { id: 'plan-1', group: 'habit', icon: 'flag', en: 'Plan finisher', es: 'Plan terminado', descEn: 'Finish a reading plan.', descEs: 'Termina un plan de lectura.', target: 1, value: (s) => s.plansDone },
  // Bible
  { id: 'book-1', group: 'bible', icon: 'book-outline', en: 'First book', es: 'Primer libro', descEn: 'Read every chapter of a book.', descEs: 'Lee todos los capítulos de un libro.', target: 1, value: (s) => s.booksDone },
  { id: 'gospels', group: 'bible', icon: 'heart', en: 'The Gospels', es: 'Los Evangelios', descEn: 'Read Matthew, Mark, Luke and John.', descEs: 'Lee Mateo, Marcos, Lucas y Juan.', target: 4, value: (s) => has(s, GOSPELS) },
  { id: 'torah', group: 'bible', icon: 'document-text-outline', en: 'The Law', es: 'El Pentateuco', descEn: 'Read Genesis to Deuteronomy.', descEs: 'Lee de Génesis a Deuteronomio.', target: 5, value: (s) => has(s, range(1, 5)) },
  { id: 'psalms', group: 'bible', icon: 'musical-notes', en: 'Songs of praise', es: 'Cánticos', descEn: 'Read all 150 Psalms.', descEs: 'Lee los 150 Salmos.', target: 1, value: (s) => has(s, [19]) },
  { id: 'proverbs', group: 'bible', icon: 'bulb-outline', en: 'Wisdom', es: 'Sabiduría', descEn: 'Read all of Proverbs.', descEs: 'Lee todo Proverbios.', target: 1, value: (s) => has(s, [20]) },
  { id: 'paul', group: 'bible', icon: 'mail-outline', en: "Paul's letters", es: 'Cartas de Pablo', descEn: 'Read Romans to Philemon.', descEs: 'Lee de Romanos a Filemón.', target: 13, value: (s) => has(s, PAUL) },
  { id: 'nt', group: 'bible', icon: 'star-half', en: 'New Testament', es: 'Nuevo Testamento', descEn: 'Read every New Testament chapter.', descEs: 'Lee todo el Nuevo Testamento.', target: 260, value: (s) => s.ntDone },
  { id: 'ot', group: 'bible', icon: 'star-half-outline', en: 'Old Testament', es: 'Antiguo Testamento', descEn: 'Read every Old Testament chapter.', descEs: 'Lee todo el Antiguo Testamento.', target: 929, value: (s) => s.otDone },
  { id: 'bible-1', group: 'bible', icon: 'star', en: 'Whole Bible', es: 'Toda la Biblia', descEn: 'Read all 1,189 chapters.', descEs: 'Lee los 1.189 capítulos.', target: TOTAL_CHAPTERS, value: (s) => s.distinct },
  { id: 'bible-2', group: 'bible', icon: 'ribbon', en: 'Twice through', es: 'Dos veces', descEn: 'Read the whole Bible twice.', descEs: 'Lee toda la Biblia dos veces.', target: 2, value: (s) => s.completions },
  // Study
  { id: 'highlight-1', group: 'study', icon: 'color-palette-outline', en: 'Highlighter', es: 'Resaltador', descEn: 'Highlight your first verse.', descEs: 'Resalta tu primer versículo.', target: 1, value: (s) => s.highlights },
  { id: 'highlight-50', group: 'study', icon: 'color-palette', en: 'Colorful', es: 'A todo color', descEn: 'Make 50 highlights.', descEs: 'Haz 50 resaltados.', target: 50, value: (s) => s.highlights },
  { id: 'words', group: 'study', icon: 'color-wand', en: 'Word by word', es: 'Palabra por palabra', descEn: 'Highlight specific words in 10 verses.', descEs: 'Resalta palabras en 10 versículos.', target: 10, value: (s) => s.wordHighlights },
  { id: 'note-1', group: 'study', icon: 'create-outline', en: 'Journaling', es: 'Diario', descEn: 'Write your first note.', descEs: 'Escribe tu primera nota.', target: 1, value: (s) => s.notes },
  { id: 'note-25', group: 'study', icon: 'create', en: 'Reflective', es: 'Reflexivo', descEn: 'Write 25 notes.', descEs: 'Escribe 25 notas.', target: 25, value: (s) => s.notes },
  { id: 'topic-3', group: 'study', icon: 'pricetags', en: 'Organizer', es: 'Organizado', descEn: 'Create 3 topics.', descEs: 'Crea 3 temas.', target: 3, value: (s) => s.topics },
  { id: 'bookmark-10', group: 'study', icon: 'bookmarks', en: 'Collector', es: 'Coleccionista', descEn: 'Bookmark 10 verses.', descEs: 'Guarda 10 marcadores.', target: 10, value: (s) => s.bookmarks },
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
