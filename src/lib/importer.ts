import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { deserializeDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { parseBibleXml } from './bible-xml';
import { guessLanguage, normalizeForSearch, parseEswordVerse, plainComments, type Mark } from './esword';
import { getT } from '@/i18n';
import { newId, notify, nowIso } from './db';

export type ImportProgress = { stage: string; done: number; total: number };

export class ImportError extends Error {}

/** Let the user pick one or more Bible files (e-Sword .bblx or Holy Bible .xml). */
export async function pickBibleFiles() {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: '*/*',
  });
  if (res.canceled) return [];
  return res.assets;
}

async function readBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const f = (asset as unknown as { file?: Blob }).file;
    if (f) return new Uint8Array(await f.arrayBuffer());
    const r = await fetch(asset.uri);
    return new Uint8Array(await r.arrayBuffer());
  }
  return new File(asset.uri).bytes();
}

type DetailsRow = {
  Description?: string;
  Abbreviation?: string;
  Comments?: string;
  OT?: number;
  NT?: number;
};

/**
 * Imports one e-Sword Bible into the app database.
 * The verse text is converted to plain text + formatting marks and stored on this device only.
 */
export async function importBible(
  db: SQLiteDatabase,
  asset: DocumentPicker.DocumentPickerAsset,
  onProgress?: (p: ImportProgress) => void
): Promise<{ id: string; name: string; verses: number }> {
  const isXml = /\.xml$/i.test(asset.name);
  if (!isXml && !/\.bblx$/i.test(asset.name)) {
    throw new ImportError(getT().t('import.notBblx', { name: asset.name }));
  }
  onProgress?.({ stage: getT().t('import.reading'), done: 0, total: 1 });
  const bytes = await readBytes(asset);

  // Holy Bible XML (one file per Bible, plain text).
  if (isXml) {
    const xml = parseBibleXml(new TextDecoder('utf-8').decode(bytes), asset.name);
    if (!xml.verses.length) throw new ImportError(getT().t('import.noVerses', { name: asset.name }));
    const sample = xml.verses
      .filter((r) => r.book === 43 && r.ch === 1)
      .slice(0, 6)
      .map((r) => r.text)
      .join(' ');
    return saveTranslation(
      db,
      {
        name: xml.name,
        abbr: xml.abbr,
        lang: xml.lang ?? guessLanguage(sample, xml.name),
        comments: xml.comments,
        sourceFile: asset.name,
        rows: xml.verses.map((r) => ({ ...r, para: false })),
      },
      onProgress
    );
  }

  // e-Sword .bblx (a SQLite database with RTF-formatted verses).
  const head = new TextDecoder().decode(bytes.slice(0, 15));
  if (head !== 'SQLite format 3') throw new ImportError(getT().t('import.unreadable', { name: asset.name }));
  const src = await deserializeDatabaseAsync(bytes);
  try {
    const details = (await src.getFirstAsync<DetailsRow>('SELECT * FROM Details').catch(() => null)) ?? {};
    const sampleType = await src.getFirstAsync<{ t: string }>(
      'SELECT typeof(Scripture) AS t FROM Bible LIMIT 1 OFFSET 100'
    );
    if (!sampleType || sampleType.t !== 'text') {
      throw new ImportError(getT().t('import.locked', { name: asset.name }));
    }
    const raw = await src.getAllAsync<{ Book: number; Chapter: number; Verse: number; Scripture: string }>(
      'SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Book BETWEEN 1 AND 66 ORDER BY Book, Chapter, Verse'
    );
    const name = (details.Description || asset.name.replace(/\.bblx$/i, '')).trim();
    const abbr = (details.Abbreviation || name.slice(0, 6)).trim();
    const sample = raw
      .filter((r) => r.Book === 43 && r.Chapter === 1)
      .slice(0, 6)
      .map((r) => r.Scripture)
      .join(' ');
    const rows: StoredVerse[] = [];
    for (const r of raw) {
      const p = parseEswordVerse(r.Scripture);
      if (p.text) rows.push({ book: r.Book, ch: r.Chapter, v: r.Verse, text: p.text, marks: p.marks, para: p.para });
    }
    return await saveTranslation(
      db,
      {
        name,
        abbr,
        lang: guessLanguage(sample || raw.slice(0, 6).map((r) => r.Scripture).join(' '), name),
        comments: plainComments(details.Comments),
        sourceFile: asset.name,
        rows,
      },
      onProgress
    );
  } finally {
    await src.closeAsync();
  }
}

type StoredVerse = { book: number; ch: number; v: number; text: string; marks: Mark[]; para: boolean };

/** Writes a Bible into this device's database (re-importing the same Bible replaces it). */
async function saveTranslation(
  db: SQLiteDatabase,
  t: { name: string; abbr: string; lang: 'en' | 'es' | 'ko'; comments: string; sourceFile: string; rows: StoredVerse[] },
  onProgress?: (p: ImportProgress) => void
): Promise<{ id: string; name: string; verses: number }> {
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM translations WHERE name = ? AND abbr = ?', t.name, t.abbr);
  const id = existing?.id ?? newId();
  const total = t.rows.length;
  if (!total) throw new ImportError(getT().t('import.noVerses', { name: t.sourceFile }));
  let hasOT = false;
  let hasNT = false;

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM verses WHERE tr = ?', id);
    // Insert in chunks of many rows per statement (far fewer round trips on a phone).
    let params: (string | number | null)[] = [];
    let pending = 0;
    const flush = async () => {
      if (!pending) return;
      const values = new Array(pending).fill('(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      await db.runAsync(`INSERT OR REPLACE INTO verses (tr, book, ch, v, text, norm, marks, para) VALUES ${values}`, params);
      params = [];
      pending = 0;
    };
    for (let i = 0; i < total; i++) {
      const r = t.rows[i];
      params.push(id, r.book, r.ch, r.v, r.text, normalizeForSearch(r.text), r.marks.length ? JSON.stringify(r.marks) : null, r.para ? 1 : 0);
      pending++;
      if (r.book <= 39) hasOT = true;
      else hasNT = true;
      if (pending >= 100) await flush();
      if (i % 2000 === 0) onProgress?.({ stage: getT().t('import.importing'), done: i, total });
    }
    await flush();
    await db.runAsync(
      `INSERT OR REPLACE INTO translations (id, name, abbr, lang, comments, verse_count, has_ot, has_nt, source_file, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      t.name,
      t.abbr,
      t.lang,
      t.comments.slice(0, 2000),
      total,
      hasOT ? 1 : 0,
      hasNT ? 1 : 0,
      t.sourceFile,
      nowIso()
    );
  });
  onProgress?.({ stage: getT().t('import.done'), done: total, total });
  notify('translations');
  return { id, name: t.name, verses: total };
}

export async function deleteTranslation(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM verses WHERE tr = ?', id);
    await db.runAsync('DELETE FROM translations WHERE id = ?', id);
    // word highlights belong to a translation
    await db.runAsync('DELETE FROM highlights WHERE tr = ?', id);
  });
  notify('translations');
  notify('highlights');
}
