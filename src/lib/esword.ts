/**
 * Converts e-Sword verse text (a small subset of RTF) into plain text plus style marks.
 *
 * e-Sword stores each verse as an RTF fragment, e.g.
 *   " {\b Salmo de David.} JEHOVA es mi pastor; ...\par"
 *   " ... darkness {\cf15\I was} upon the face ..."
 *   " In {\cf6\super G1722} the beginning ..."     (Strong's numbers)
 */

/** i = italic, b = bold, r = words of Jesus (red letters), f = reference letter like (A) or [7] (s = e, label in x). */
export type MarkType = 'i' | 'b' | 'r' | 'f';
export type Mark = { s: number; e: number; t: MarkType; x?: string };
export type ParsedVerse = {
  text: string;
  marks: Mark[];
  /** True when the verse ends a paragraph. */
  para: boolean;
};

type Style = { i: boolean; b: boolean; r: boolean; hidden: boolean; skip: boolean; sup?: boolean };

/** e-Sword's color number for the words of Jesus (RVR1960, LBLA, ESV, …). */
const RED = 6;

const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ',
  0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“',
  0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›',
  0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

const SYMBOLS: Record<string, string> = {
  bullet: '•', emdash: '—', endash: '–', ldblquote: '“', rdblquote: '”',
  lquote: '‘', rquote: '’', tab: ' ', line: '\n',
};

/** Destination groups whose content is never shown. */
const SKIP_GROUPS = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', '*']);

/**
 * Converts e-Sword RTF to plain text + style marks.
 * showSuper: keep superscript text (commentaries use it for reference letters like "A"); Bibles hide it.
 */
export function parseEswordVerse(raw: string | null | undefined, opts: { showSuper?: boolean } = {}): ParsedVerse {
  const src = raw ?? '';
  let out = '';
  const marks: Mark[] = [];
  const stack: Style[] = [];
  let st: Style = { i: false, b: false, r: false, hidden: false, skip: false };
  let groupStart = false; // true right after "{" (to detect destination groups)
  let skipFallback = 0; // chars to skip after \uN
  let paraAtEnd = false;

  // Open style runs: start offsets for i / b / r
  let iStart = -1;
  let bStart = -1;
  let rStart = -1;
  const syncMarks = () => {
    const visibleI = st.i && !st.hidden && !st.skip;
    const visibleB = st.b && !st.hidden && !st.skip;
    if (visibleI && iStart < 0) iStart = out.length;
    if (!visibleI && iStart >= 0) {
      if (out.length > iStart) marks.push({ s: iStart, e: out.length, t: 'i' });
      iStart = -1;
    }
    if (visibleB && bStart < 0) bStart = out.length;
    if (!visibleB && bStart >= 0) {
      if (out.length > bStart) marks.push({ s: bStart, e: out.length, t: 'b' });
      bStart = -1;
    }
    const visibleR = st.r && !st.hidden && !st.skip;
    if (visibleR && rStart < 0) rStart = out.length;
    if (!visibleR && rStart >= 0) {
      if (out.length > rStart) marks.push({ s: rStart, e: out.length, t: 'r' });
      rStart = -1;
    }
  };

  // Superscript text (hidden in Bibles): kept aside so reference letters like "(A)" can become markers.
  let supBuf = '';
  const flushSup = () => {
    const m = /^[([]\s*([A-Za-z0-9]{1,3})\s*[)\]]$/.exec(supBuf.trim());
    if (m) marks.push({ s: out.length, e: out.length, t: 'f', x: m[1] });
    supBuf = '';
  };
  const emit = (ch: string) => {
    if (st.hidden && st.sup && !st.skip) {
      supBuf += ch;
      return;
    }
    if (st.hidden || st.skip) return;
    if (skipFallback > 0) {
      skipFallback--;
      return;
    }
    out += ch;
  };

  let k = 0;
  while (k < src.length) {
    const c = src[k];
    if (c === '{') {
      stack.push(st);
      st = { ...st };
      groupStart = true;
      k++;
      continue;
    }
    if (c === '}') {
      const wasSup = !!st.sup && st.hidden;
      st = stack.pop() ?? { i: false, b: false, r: false, hidden: false, skip: false };
      if (wasSup && !(st.sup && st.hidden)) flushSup();
      syncMarks();
      groupStart = false;
      k++;
      continue;
    }
    if (c === '\\') {
      const next = src[k + 1];
      if (next === '\\' || next === '{' || next === '}') {
        emit(next);
        k += 2;
        groupStart = false;
        continue;
      }
      if (next === "'") {
        const code = parseInt(src.substr(k + 2, 2), 16);
        if (!Number.isNaN(code)) emit(CP1252[code] ?? String.fromCharCode(code));
        k += 4;
        groupStart = false;
        continue;
      }
      if (next === '*') {
        if (groupStart) st.skip = true;
        k += 2;
        continue;
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(k + 1));
      if (!m) {
        k++;
        continue;
      }
      const word = m[1];
      const lower = word.toLowerCase();
      const num = m[2] !== undefined ? parseInt(m[2], 10) : undefined;
      k += 1 + m[0].length;

      if (groupStart && SKIP_GROUPS.has(lower)) st.skip = true;
      groupStart = false;

      switch (lower) {
        case 'par':
          // Paragraph break: at the very end of the verse it marks a new paragraph.
          if (/^[\s}]*$/.test(src.slice(k))) paraAtEnd = true;
          else emit('\n');
          break;
        case 'i':
          st.i = num !== 0;
          break;
        case 'b':
          st.b = num !== 0;
          break;
        case 'super':
        case 'sub':
          st.hidden = !opts.showSuper; // Strong's numbers / footnote markers
          st.sup = num !== 0;
          if (num === 0) {
            st.hidden = false;
            flushSup();
          }
          break;
        case 'nosupersub':
          if (st.sup) flushSup();
          st.hidden = false;
          st.sup = false;
          break;
        case 'cf':
          // Text color: color 6 is how e-Sword Bibles mark the words of Jesus.
          st.r = num === RED;
          break;
        case 'plain':
          st.i = false;
          st.b = false;
          st.r = false;
          if (st.sup) flushSup();
          st.sup = false;
          st.hidden = false;
          break;
        case 'u':
          if (num !== undefined) {
            emit(String.fromCharCode(num < 0 ? num + 65536 : num));
            skipFallback = 1;
          }
          break;
        default:
          if (SYMBOLS[lower] !== undefined) emit(SYMBOLS[lower]);
          // every other control word (fonts, colors, sizes...) is ignored
          break;
      }
      syncMarks();
      continue;
    }
    if (c === '\r' || c === '\n') {
      k++;
      continue;
    }
    groupStart = false;
    emit(c);
    k++;
  }
  // close open runs
  if (supBuf) flushSup();
  st = { i: false, b: false, r: false, hidden: false, skip: false };
  syncMarks();

  // Strip stray tags like <1> and normalize whitespace while remapping mark offsets.
  return normalize(out, marks, paraAtEnd);
}

function normalize(text: string, marks: Mark[], para: boolean): ParsedVerse {
  const keep: boolean[] = new Array(text.length).fill(true);
  for (const m of text.matchAll(/<[^<>\s]{1,10}>/g)) {
    for (let j = m.index!; j < m.index! + m[0].length; j++) keep[j] = false;
  }
  // collapse whitespace
  let prevSpace = true; // trims leading space
  for (let j = 0; j < text.length; j++) {
    if (!keep[j]) continue;
    const isSpace = text[j] === ' ' || text[j] === '\t' || text[j] === ' ';
    if (isSpace && prevSpace) keep[j] = false;
    prevSpace = isSpace || text[j] === '\n';
  }
  const map: number[] = new Array(text.length + 1);
  let res = '';
  for (let j = 0; j < text.length; j++) {
    map[j] = res.length;
    if (keep[j]) res += text[j] === '\t' || text[j] === ' ' ? ' ' : text[j];
  }
  map[text.length] = res.length;
  // trim trailing whitespace
  const trimmed = res.replace(/\s+$/, '');
  const newMarks = marks
    .map((m) => ({ ...m, s: Math.min(map[m.s], trimmed.length), e: Math.min(map[m.e], trimmed.length) }))
    .filter((m) => m.e > m.s || m.t === 'f');
  return { text: trimmed, marks: newMarks, para };
}

/** Lowercase, accent-free version used for search. */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Strip RTF from the Details.Comments field. */
export function plainComments(raw: string | null | undefined): string {
  return parseEswordVerse((raw ?? '').replace(/\\par/g, '\\line ')).text;
}

const SPANISH_HINTS = /\b(el|los|las|del|que|y|en|por|para|dios|señor|jesús)\b/g;
const ENGLISH_HINTS = /\b(the|and|of|that|lord|god|unto|shall|jesus|which)\b/g;

export function guessLanguage(sample: string, description = ''): 'en' | 'es' | 'ko' {
  // Korean: mostly Hangul characters.
  const hangul = (sample.match(/[가-힣]/g) ?? []).length;
  if (hangul > 20 || /[가-힣]/.test(description)) return 'ko';
  // (Not plain 'version': English names like 'King James Version' have it too.)
  if (/biblia|versión|reina|nuevo testamento|traducci/i.test(description)) return 'es';
  const t = normalizeForSearch(sample);
  const es = (t.match(SPANISH_HINTS) ?? []).length;
  const en = (t.match(ENGLISH_HINTS) ?? []).length;
  return es > en ? 'es' : 'en';
}
