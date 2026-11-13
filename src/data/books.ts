/** The 66 books of the Protestant canon, numbered 1–66 (same numbering as e-Sword). */
export type Book = {
  n: number;
  en: string;
  es: string;
  enAbbr: string;
  esAbbr: string;
  chapters: number;
  testament: 'OT' | 'NT';
};

const RAW: [string, string, string, string, number][] = [
  ['Genesis', 'Génesis', 'Gen', 'Gn', 50],
  ['Exodus', 'Éxodo', 'Exo', 'Éx', 40],
  ['Leviticus', 'Levítico', 'Lev', 'Lv', 27],
  ['Numbers', 'Números', 'Num', 'Nm', 36],
  ['Deuteronomy', 'Deuteronomio', 'Deu', 'Dt', 34],
  ['Joshua', 'Josué', 'Jos', 'Jos', 24],
  ['Judges', 'Jueces', 'Jdg', 'Jue', 21],
  ['Ruth', 'Rut', 'Rth', 'Rt', 4],
  ['1 Samuel', '1 Samuel', '1Sa', '1S', 31],
  ['2 Samuel', '2 Samuel', '2Sa', '2S', 24],
  ['1 Kings', '1 Reyes', '1Ki', '1R', 22],
  ['2 Kings', '2 Reyes', '2Ki', '2R', 25],
  ['1 Chronicles', '1 Crónicas', '1Ch', '1Cr', 29],
  ['2 Chronicles', '2 Crónicas', '2Ch', '2Cr', 36],
  ['Ezra', 'Esdras', 'Ezr', 'Esd', 10],
  ['Nehemiah', 'Nehemías', 'Neh', 'Neh', 13],
  ['Esther', 'Ester', 'Est', 'Est', 10],
  ['Job', 'Job', 'Job', 'Job', 42],
  ['Psalms', 'Salmos', 'Psa', 'Sal', 150],
  ['Proverbs', 'Proverbios', 'Pro', 'Pr', 31],
  ['Ecclesiastes', 'Eclesiastés', 'Ecc', 'Ec', 12],
  ['Song of Solomon', 'Cantares', 'Sng', 'Cnt', 8],
  ['Isaiah', 'Isaías', 'Isa', 'Is', 66],
  ['Jeremiah', 'Jeremías', 'Jer', 'Jer', 52],
  ['Lamentations', 'Lamentaciones', 'Lam', 'Lm', 5],
  ['Ezekiel', 'Ezequiel', 'Eze', 'Ez', 48],
  ['Daniel', 'Daniel', 'Dan', 'Dn', 12],
  ['Hosea', 'Oseas', 'Hos', 'Os', 14],
  ['Joel', 'Joel', 'Joe', 'Jl', 3],
  ['Amos', 'Amós', 'Amo', 'Am', 9],
  ['Obadiah', 'Abdías', 'Oba', 'Abd', 1],
  ['Jonah', 'Jonás', 'Jon', 'Jon', 4],
  ['Micah', 'Miqueas', 'Mic', 'Mi', 7],
  ['Nahum', 'Nahúm', 'Nah', 'Nah', 3],
  ['Habakkuk', 'Habacuc', 'Hab', 'Hab', 3],
  ['Zephaniah', 'Sofonías', 'Zep', 'Sof', 3],
  ['Haggai', 'Hageo', 'Hag', 'Hag', 2],
  ['Zechariah', 'Zacarías', 'Zec', 'Zac', 14],
  ['Malachi', 'Malaquías', 'Mal', 'Mal', 4],
  ['Matthew', 'Mateo', 'Mat', 'Mt', 28],
  ['Mark', 'Marcos', 'Mar', 'Mr', 16],
  ['Luke', 'Lucas', 'Luk', 'Lc', 24],
  ['John', 'Juan', 'Jhn', 'Jn', 21],
  ['Acts', 'Hechos', 'Act', 'Hch', 28],
  ['Romans', 'Romanos', 'Rom', 'Ro', 16],
  ['1 Corinthians', '1 Corintios', '1Co', '1Co', 16],
  ['2 Corinthians', '2 Corintios', '2Co', '2Co', 13],
  ['Galatians', 'Gálatas', 'Gal', 'Gá', 6],
  ['Ephesians', 'Efesios', 'Eph', 'Ef', 6],
  ['Philippians', 'Filipenses', 'Php', 'Fil', 4],
  ['Colossians', 'Colosenses', 'Col', 'Col', 4],
  ['1 Thessalonians', '1 Tesalonicenses', '1Th', '1Ts', 5],
  ['2 Thessalonians', '2 Tesalonicenses', '2Th', '2Ts', 3],
  ['1 Timothy', '1 Timoteo', '1Ti', '1Ti', 6],
  ['2 Timothy', '2 Timoteo', '2Ti', '2Ti', 4],
  ['Titus', 'Tito', 'Tit', 'Tit', 3],
  ['Philemon', 'Filemón', 'Phm', 'Flm', 1],
  ['Hebrews', 'Hebreos', 'Heb', 'He', 13],
  ['James', 'Santiago', 'Jas', 'Stg', 5],
  ['1 Peter', '1 Pedro', '1Pe', '1P', 5],
  ['2 Peter', '2 Pedro', '2Pe', '2P', 3],
  ['1 John', '1 Juan', '1Jn', '1Jn', 5],
  ['2 John', '2 Juan', '2Jn', '2Jn', 1],
  ['3 John', '3 Juan', '3Jn', '3Jn', 1],
  ['Jude', 'Judas', 'Jud', 'Jud', 1],
  ['Revelation', 'Apocalipsis', 'Rev', 'Ap', 22],
];

export const BOOKS: Book[] = RAW.map(([en, es, enAbbr, esAbbr, chapters], i) => ({
  n: i + 1,
  en,
  es,
  enAbbr,
  esAbbr,
  chapters,
  testament: i < 39 ? 'OT' : 'NT',
}));

export const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b.chapters, 0); // 1189

export function getBook(n: number): Book {
  return BOOKS[n - 1];
}

export type Lang = 'en' | 'es';

export function bookName(n: number, lang: Lang): string {
  const b = getBook(n);
  return b ? (lang === 'es' ? b.es : b.en) : `Book ${n}`;
}

export function refLabel(book: number, chapter: number, verse: number | undefined, lang: Lang) {
  return `${bookName(book, lang)} ${chapter}${verse ? `:${verse}` : ''}`;
}
