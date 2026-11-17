/**
 * Bible references inside e-Sword commentaries look like "Luk_2:14", "2Co_5:19-21" (English abbreviations,
 * and a few Spanish ones in Spanish modules). This finds them so the notes sheet can make them tappable.
 */
const BOOKS: Record<string, number> = {};
const add = (n: number, ...names: string[]) => names.forEach((x) => (BOOKS[x] = n));
add(1, 'Gen'); add(2, 'Exo'); add(3, 'Lev'); add(4, 'Num'); add(5, 'Deu'); add(6, 'Jos'); add(7, 'Jdg', 'Jue');
add(8, 'Rut', 'Rth'); add(9, '1Sa'); add(10, '2Sa'); add(11, '1Ki', '1Re'); add(12, '2Ki', '2Re'); add(13, '1Ch', '1Cr');
add(14, '2Ch', '2Cr'); add(15, 'Ezr', 'Esd'); add(16, 'Neh'); add(17, 'Est'); add(18, 'Job'); add(19, 'Psa', 'Sal');
add(20, 'Pro'); add(21, 'Ecc'); add(22, 'Son', 'Cnt'); add(23, 'Isa'); add(24, 'Jer'); add(25, 'Lam'); add(26, 'Eze');
add(27, 'Dan'); add(28, 'Hos', 'Ose'); add(29, 'Joe'); add(30, 'Amo'); add(31, 'Oba', 'Abd'); add(32, 'Jon');
add(33, 'Mic', 'Miq'); add(34, 'Nah'); add(35, 'Hab'); add(36, 'Zep', 'Sof'); add(37, 'Hag'); add(38, 'Zec', 'Zac');
add(39, 'Mal'); add(40, 'Mat'); add(41, 'Mar'); add(42, 'Luk', 'Luc'); add(43, 'Joh', 'Jua'); add(44, 'Act', 'Hch');
add(45, 'Rom'); add(46, '1Co'); add(47, '2Co'); add(48, 'Gal'); add(49, 'Eph', 'Efe'); add(50, 'Phi', 'Php', 'Flp');
add(51, 'Col'); add(52, '1Th', '1Ts'); add(53, '2Th', '2Ts'); add(54, '1Ti'); add(55, '2Ti'); add(56, 'Tit');
add(57, 'Phm', 'Flm'); add(58, 'Heb'); add(59, 'Jam', 'Jas', 'Stg'); add(60, '1Pe'); add(61, '2Pe');
add(62, '1Jo', '1Jn'); add(63, '2Jo', '2Jn'); add(64, '3Jo', '3Jn'); add(65, 'Jud'); add(66, 'Rev', 'Apo');

export type RefPart = { text: string; ref?: { book: number; ch: number; v: number; v2?: number } };

/** Splits text into plain parts and references ("Luk_2:14" → Luke 2:14). Unknown books (e.g. Tobit) stay text. */
export function splitRefs(text: string): RefPart[] {
  const out: RefPart[] = [];
  let last = 0;
  for (const m of text.matchAll(/\b([1-3]?[A-Z][a-z]{1,3})_(\d+):(\d+)(?:-(\d+))?/g)) {
    const book = BOOKS[m[1]];
    if (!book) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], ref: { book, ch: Number(m[2]), v: Number(m[3]), v2: m[4] ? Number(m[4]) : undefined } });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
