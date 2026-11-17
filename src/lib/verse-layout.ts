import type { Highlight, Verse } from './data';

/**
 * Printed-Bible layout from the e-Sword text:
 * - "¶" at the start of a verse starts a new paragraph (and isn't shown);
 * - a section title stored at the start of a verse (a bold first line, e.g. RV 1960's
 *   "Aflicción de los israelitas en Egipto") becomes a heading on its own line.
 * `cut` = characters removed from the start, so word highlights (saved as positions in the
 * original text) still land on the same words.
 */
export function layoutVerse(v: Verse): Verse {
  let text = v.text;
  let cut = 0;
  let title: string | null = null;
  let paraStart = false;

  // Blank lines before a title (RV 1960 stores "\n\nTitle\nVerse...").
  const lead = /^\s+/.exec(text);
  if (lead) {
    cut = lead[0].length;
    text = text.slice(cut);
  }

  const nl = text.indexOf('\n');
  if (nl > 0) {
    const head = text.slice(0, nl).trim();
    const at = cut + text.indexOf(head); // marks use positions in the stored text
    const bold = v.marks.some((m) => m.t === 'b' && m.s <= at && m.e >= at + head.length);
    if (head && bold && head.length <= 160) {
      title = head;
      let rest = nl + 1;
      while (rest < text.length && /\s/.test(text[rest])) rest++;
      cut += rest;
      text = text.slice(rest);
      paraStart = true;
    }
  }
  const p = /^\s*¶\s*/.exec(text);
  if (p) {
    cut += p[0].length;
    text = text.slice(p[0].length);
    paraStart = true;
  }
  // Any other pilcrow inside a verse: hide it without moving the rest of the text.
  if (text.includes('¶')) text = text.replace(/¶/g, ' ');

  if (!cut) return text === v.text ? v : { ...v, text };
  const marks = v.marks
    .map((m) => ({ ...m, s: Math.max(0, m.s - cut), e: Math.max(0, m.e - cut) }))
    .filter((m) => m.e > m.s || m.t === 'f');
  return { ...v, text, marks, title, paraStart, cut };
}

/** Word highlights moved to the shown text (see `cut`). */
export function shiftHighlights(hls: Highlight[], cut = 0): Highlight[] {
  if (!cut) return hls;
  return hls.map((h) => (h.start == null || h.end == null ? h : { ...h, start: h.start - cut, end: h.end - cut }));
}
