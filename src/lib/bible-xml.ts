import type { Mark } from './esword';

/**
 * Bibles in the "Holy Bible XML" format (github.com/Beblia/Holy-Bible-XML-Format):
 *
 *   <bible translation="Spanish RVR 1960 (…)" status="© …" link="…">
 *     <testament name="Old"><book number="1"><chapter number="1">
 *       <verse number="1">En el principio creó Dios…</verse>
 *
 * Books are numbered 1–66 like Lámpara. Text is plain. Some Bibles (e.g. Korean NKRV) start a verse
 * with a section title in brackets, "[에덴 동산]이것이…": that becomes a bold first line, which the
 * reader shows as a heading (see verse-layout.ts).
 */
export type XmlVerse = { book: number; ch: number; v: number; text: string; marks: Mark[] };
export type XmlBible = {
  name: string;
  abbr: string;
  /** From the file name / title ("Spanish…", "English…", "Korean…"); null = guess from the text. */
  lang: 'en' | 'es' | 'ko' | null;
  comments: string;
  verses: XmlVerse[];
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag: string) {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:-]+)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = decode(m[2]);
  return out;
}

const LANG_WORD: Record<string, 'en' | 'es' | 'ko'> = { english: 'en', spanish: 'es', korean: 'ko' };
const ABBR_FIX: Record<string, string> = { KJ: 'KJV', NKJ: 'NKJV', LBLB: 'LBLA' };
/** Full names for files whose title is only the abbreviation. */
const NAME_FIX: Record<string, string> = { KJV: 'King James Version', NKJV: 'New King James Version' };

/** "SpanishRVR1960Bible.xml" → { lang: 'es', abbr: 'RVR1960' } */
function fromFileName(fileName: string) {
  const base = fileName.replace(/\.xml$/i, '');
  const m = /^(English|Spanish|Korean)(.*?)(Bible)?$/i.exec(base);
  if (!m) return { lang: null, abbr: base.replace(/Bible$/i, '') };
  const abbr = m[2].trim();
  return { lang: LANG_WORD[m[1].toLowerCase()] ?? null, abbr: ABBR_FIX[abbr.toUpperCase()] ?? abbr };
}

/** A readable name from the translation attribute (the files use a few different styles). */
function cleanName(translation: string, abbr: string) {
  let t = translation.trim();
  // "English ESV 2016 == The Holy Bible, English Standard Version. ESV® Text Edition…"
  const eq = t.split('==')[1];
  if (eq) return eq.split('.')[0].trim();
  // "Spanish NVI Bible - Nueva Versión Internacional"
  const dash = t.split(' - ')[1];
  if (dash) return dash.trim();
  // "Spanish NTV (Nueva Traducción Viviente)", "Spanish RVR 1960 (Más información sobre Biblia Reina Valera 1960)"
  const paren = /\(([^)]+)\)/.exec(t)?.[1];
  if (paren) return paren.replace(/^(más información sobre|more information about)\s+/i, '').trim();
  t = t.replace(/^(English|Spanish|Korean)\s+/i, '').trim();
  return t || abbr;
}

export function parseBibleXml(xml: string, fileName: string): XmlBible {
  const text = xml.replace(/^﻿/, '');
  const root = attrs(/<bible\b[^>]*>/i.exec(text)?.[0] ?? '');
  const file = fromFileName(fileName);
  const translation = root.translation ?? '';
  const titleLang = /^(English|Spanish|Korean)\b/i.exec(translation)?.[1]?.toLowerCase();
  const lang = file.lang ?? (titleLang ? LANG_WORD[titleLang] : null);
  // "SpanishBible.xml" has no abbreviation in its name: take it from the title ("Spanish RVR 1909 (…)" → "RVR1909").
  const fromTitle = translation.replace(/\(.*$/, '').replace(/^(English|Spanish|Korean)\s+/i, '').replace(/\s+/g, '');
  const abbr = (file.abbr || fromTitle || fileName).slice(0, 12);
  const name = NAME_FIX[abbr] ?? cleanName(translation, abbr);
  const comments = [root.status, root.info, root.link].filter(Boolean).join('\n');

  const verses: XmlVerse[] = [];
  let book = 0;
  let ch = 0;
  const re = /<book\b([^>]*)>|<chapter\b([^>]*)>|<verse\b([^>]*?)(?:\/>|>([\s\S]*?)<\/verse>)/gi;
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) book = parseInt(attrs(m[1]).number ?? '0', 10);
    else if (m[2] !== undefined) ch = parseInt(attrs(m[2]).number ?? '0', 10);
    else {
      const v = parseInt(attrs(m[3] ?? '').number ?? '0', 10);
      if (book < 1 || book > 66 || ch < 1 || v < 1) continue;
      // Plain text (drop any inner tags), single spaces.
      let body = decode((m[4] ?? '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (!body) continue; // combined verses leave empty ones behind
      let marks: Mark[] = [];
      // "[Section title]Verse text" → bold first line (not "[[…]]" textual notes).
      const t = /^\[(?!\[)([^\]]{1,80})\]\s*(\S[\s\S]*)$/.exec(body);
      if (t) {
        body = `${t[1].trim()}\n${t[2]}`;
        marks = [{ s: 0, e: t[1].trim().length, t: 'b' }];
      }
      verses.push({ book, ch, v, text: body, marks });
    }
  }
  return { name, abbr, lang, comments, verses };
}
