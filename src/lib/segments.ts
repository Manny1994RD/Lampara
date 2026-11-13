import type { HighlightColor } from '@/constants/theme';
import type { Highlight } from './data';
import type { Mark } from './esword';

export type Segment = {
  text: string;
  start: number;
  italic: boolean;
  bold: boolean;
  /** word-level highlight color (takes priority over the verse color) */
  color: HighlightColor | null;
};

/**
 * Splits a verse into styled runs, combining the translation's italic/bold marks
 * with the user's word highlights for this translation.
 */
export function buildSegments(text: string, marks: Mark[], wordHighlights: Highlight[]): Segment[] {
  const cuts = new Set<number>([0, text.length]);
  marks.forEach((m) => {
    cuts.add(m.s);
    cuts.add(m.e);
  });
  wordHighlights.forEach((h) => {
    if (h.start != null && h.end != null) {
      cuts.add(Math.max(0, Math.min(text.length, h.start)));
      cuts.add(Math.max(0, Math.min(text.length, h.end)));
    }
  });
  const points = [...cuts].sort((a, b) => a - b);
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i];
    const e = points[i + 1];
    if (e <= s) continue;
    const italic = marks.some((m) => m.t === 'i' && m.s <= s && m.e >= e);
    const bold = marks.some((m) => m.t === 'b' && m.s <= s && m.e >= e);
    // latest highlight wins
    let color: HighlightColor | null = null;
    for (const h of wordHighlights) {
      if (h.start != null && h.end != null && h.start <= s && h.end >= e) color = h.color;
    }
    segs.push({ text: text.slice(s, e), start: s, italic, bold, color });
  }
  return segs;
}

/** Word tokens with their character ranges (used by the word highlighter). */
export function tokenize(text: string) {
  const out: { word: string; s: number; e: number }[] = [];
  for (const m of text.matchAll(/\S+/g)) out.push({ word: m[0], s: m.index!, e: m.index! + m[0].length });
  return out;
}
