import type * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { deserializeDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { getT } from '@/i18n';
import { newId, notify } from './db';
import { guessLanguage, parseEswordVerse, plainComments, type Mark } from './esword';
import { getHub, hubFetch } from './hub';

/**
 * Commentaries, study notes and cross-references (e-Sword .cmtx) in the church library.
 * The owner imports a file here (it's read on the device and uploaded to the hub);
 * everyone signed in reads the notes for a verse from the hub.
 */

export type CommentaryKind = 'refs' | 'notes' | 'commentary';
export type Commentary = { id: string; name: string; abbr: string; lang: string; kind: CommentaryKind; comments: string; entries: number };
export type Note = {
  cm: string;
  name: string;
  abbr: string;
  kind: CommentaryKind;
  lang: string;
  ch1: number;
  v1: number;
  ch2: number;
  v2: number;
  text: string;
  marks: Mark[];
};

export class CommentaryError extends Error {}

/** References first, then a version's notes, then full commentaries. */
function kindOf(name: string): CommentaryKind {
  if (/referencia|tesoro|treasury|cross.?ref/i.test(name)) return 'refs';
  if (/\bnotas?\b|\bnotes?\b|footnote|al pie/i.test(name)) return 'notes';
  return 'commentary';
}

async function readBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const f = (asset as unknown as { file?: Blob }).file;
    if (f) return new Uint8Array(await f.arrayBuffer());
    return new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
  }
  return new File(asset.uri).bytes();
}

/** Plain text without blank lines at the start (marks moved to match). */
function clean(raw: string): { text: string; marks: Mark[] } {
  const p = parseEswordVerse(raw, { showSuper: true });
  const lead = /^\s+/.exec(p.text)?.[0].length ?? 0;
  const text = p.text.slice(lead).replace(/\n{3,}/g, '\n\n');
  if (!lead) return { text, marks: p.marks };
  return {
    text,
    marks: p.marks.map((m) => ({ ...m, s: Math.max(0, m.s - lead), e: m.e - lead })).filter((m) => m.e > m.s),
  };
}

type Entry = [number, number, number, number, number, string, string];

/** Reads an e-Sword .cmtx file and uploads it to the church library (owner only). */
export async function importCommentary(asset: DocumentPicker.DocumentPickerAsset, onProgress?: (pct: number) => void) {
  const { t } = getT();
  if (!/\.cmtx$/i.test(asset.name)) throw new CommentaryError(t('notes.notCmtx', { name: asset.name }));
  if (!getHub()) throw new CommentaryError(t('notes.needHub'));
  const bytes = await readBytes(asset);
  if (new TextDecoder().decode(bytes.slice(0, 15)) !== 'SQLite format 3') {
    throw new CommentaryError(t('import.unreadable', { name: asset.name }));
  }
  const src = await deserializeDatabaseAsync(bytes);
  try {
    // Locked (encrypted) modules store bytes instead of text.
    const type = await src.getFirstAsync<{ t: string }>("SELECT typeof(Comments) AS t FROM Verses WHERE Comments IS NOT NULL LIMIT 1 OFFSET 10");
    if (!type || type.t !== 'text') throw new CommentaryError(t('notes.locked', { name: asset.name }));

    const details =
      (await src.getFirstAsync<{ Description?: string; Abbreviation?: string; Comments?: string }>('SELECT * FROM Details').catch(() => null)) ?? {};
    const name = (details.Description || asset.name.replace(/\.cmtx$/i, '')).trim();
    const abbr = (details.Abbreviation || name.slice(0, 8)).trim();
    // Only references and a version's own notes (footnotes); full commentaries (one author's views) aren't used.
    if (kindOf(name) === 'commentary') throw new CommentaryError(t('notes.onlyRefsNotes', { name }));

    const entries: Entry[] = [];
    const verses = await src.getAllAsync<{ Book: number; ChapterBegin: number; VerseBegin: number; ChapterEnd: number; VerseEnd: number; Comments: string }>(
      'SELECT Book, ChapterBegin, VerseBegin, ChapterEnd, VerseEnd, Comments FROM Verses WHERE Book BETWEEN 1 AND 66'
    );
    for (const r of verses) {
      const c = clean(r.Comments ?? '');
      if (!c.text) continue;
      const ch2 = Math.max(r.ChapterBegin, r.ChapterEnd || r.ChapterBegin);
      const v2 = r.VerseEnd || r.VerseBegin;
      entries.push([r.Book, r.ChapterBegin, r.VerseBegin, ch2, ch2 === r.ChapterBegin ? Math.max(v2, r.VerseBegin) : v2, c.text, c.marks.length ? JSON.stringify(c.marks) : '']);
    }
    // Notes about a whole chapter: shown for every verse in it (as "about the passage").
    const chapters = await src
      .getAllAsync<{ Book: number; Chapter: number; Comments: string }>('SELECT Book, Chapter, Comments FROM Chapters WHERE Book BETWEEN 1 AND 66')
      .catch(() => []);
    for (const r of chapters) {
      const c = clean(r.Comments ?? '');
      if (c.text) entries.push([r.Book, r.Chapter, 0, r.Chapter, 999, c.text, c.marks.length ? JSON.stringify(c.marks) : '']);
    }
    if (!entries.length) throw new CommentaryError(t('import.noVerses', { name: asset.name }));

    const sample = entries
      .slice(0, 40)
      .map((e) => e[5])
      .join(' ');
    const id = newId();
    await hubFetch('/api/lampara/commentaries', {
      method: 'POST',
      body: { id, name, abbr, lang: guessLanguage(sample, name), kind: kindOf(name), comments: plainComments(details.Comments).slice(0, 2000) },
    });
    // Batches of at most 1500 entries or about 1.5 MB.
    let batch: Entry[] = [];
    let size = 0;
    let sent = 0;
    const flush = async () => {
      if (!batch.length) return;
      await hubFetch(`/api/lampara/commentaries/${id}/entries`, { method: 'POST', body: { entries: batch } });
      sent += batch.length;
      onProgress?.(Math.round((sent / entries.length) * 100));
      batch = [];
      size = 0;
    };
    for (const e of entries) {
      batch.push(e);
      size += e[5].length + e[6].length + 40;
      if (batch.length >= 1500 || size > 1_500_000) await flush();
    }
    await flush();
    await hubFetch(`/api/lampara/commentaries/${id}/finish`, { method: 'POST' });
    notify('hub');
    return { name, entries: entries.length };
  } finally {
    await src.closeAsync();
  }
}

export async function listCommentaries(): Promise<{ items: Commentary[]; can_manage: boolean }> {
  if (!getHub()) return { items: [], can_manage: false };
  return hubFetch('/api/lampara/commentaries');
}

export async function deleteCommentary(id: string) {
  await hubFetch(`/api/lampara/commentaries/${encodeURIComponent(id)}`, { method: 'DELETE' });
  notify('hub');
}

/** Everything in the library about one verse (references, notes, commentaries). */
export async function getNotes(book: number, ch: number, v: number): Promise<Note[]> {
  if (!getHub()) return [];
  const res = await hubFetch<{ items: (Omit<Note, 'marks'> & { marks: string })[] }>(`/api/lampara/notes?book=${book}&ch=${ch}&v=${v}`);
  return res.items.map((n) => ({ ...n, marks: n.marks ? (JSON.parse(n.marks) as Mark[]) : [] }));
}
