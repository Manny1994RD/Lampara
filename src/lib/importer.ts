import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { deserializeDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { guessLanguage, normalizeForSearch, parseEswordVerse, plainComments } from './esword';
import { newId, notify, nowIso } from './db';

export type ImportProgress = { stage: string; done: number; total: number };

export class ImportError extends Error {}

/** Let the user pick one or more e-Sword .bblx files. */
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
  if (!/\.bblx$/i.test(asset.name)) {
    throw new ImportError(`"${asset.name}" is not an e-Sword Bible (.bblx) file.`);
  }
  onProgress?.({ stage: 'Reading file', done: 0, total: 1 });
  const bytes = await readBytes(asset);
  const head = new TextDecoder().decode(bytes.slice(0, 15));
  if (head !== 'SQLite format 3') throw new ImportError(`"${asset.name}" could not be read.`);

  const src = await deserializeDatabaseAsync(bytes);
  try {
    const details = (await src.getFirstAsync<DetailsRow>('SELECT * FROM Details').catch(() => null)) ?? {};
    const sampleType = await src.getFirstAsync<{ t: string }>(
      'SELECT typeof(Scripture) AS t FROM Bible LIMIT 1 OFFSET 100'
    );
    if (!sampleType || sampleType.t !== 'text') {
      throw new ImportError(
        `"${asset.name}" is a locked (encrypted) e-Sword module, so its text can't be read. ` +
          'Use a different copy of this translation.'
      );
    }

    const rows = await src.getAllAsync<{ Book: number; Chapter: number; Verse: number; Scripture: string }>(
      'SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Book BETWEEN 1 AND 66 ORDER BY Book, Chapter, Verse'
    );

    const name = (details.Description || asset.name.replace(/\.bblx$/i, '')).trim();
    const abbr = (details.Abbreviation || name.slice(0, 6)).trim();
    const sample = rows
      .filter((r) => r.Book === 43 && r.Chapter === 1)
      .slice(0, 6)
      .map((r) => r.Scripture)
      .join(' ');
    const lang = guessLanguage(sample || rows.slice(0, 6).map((r) => r.Scripture).join(' '), name);

    // Re-importing the same translation replaces it.
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM translations WHERE name = ? AND abbr = ?',
      name,
      abbr
    );
    const id = existing?.id ?? newId();

    let count = 0;
    let hasOT = false;
    let hasNT = false;
    const total = rows.length;
    const BATCH = 2000;

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM verses WHERE tr = ?', id);
      // Insert in chunks of many rows per statement (far fewer round trips on a phone).
      let params: (string | number | null)[] = [];
      let pending = 0;
      const flush = async () => {
        if (!pending) return;
        const values = new Array(pending).fill('(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        await db.runAsync(
          `INSERT OR REPLACE INTO verses (tr, book, ch, v, text, norm, marks, para) VALUES ${values}`,
          params
        );
        params = [];
        pending = 0;
      };
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const p = parseEswordVerse(r.Scripture);
        if (!p.text) continue;
        params.push(
          id,
          r.Book,
          r.Chapter,
          r.Verse,
          p.text,
          normalizeForSearch(p.text),
          p.marks.length ? JSON.stringify(p.marks) : null,
          p.para ? 1 : 0
        );
        pending++;
        count++;
        if (r.Book <= 39) hasOT = true;
        else hasNT = true;
        if (pending >= 100) await flush();
        if (i % BATCH === 0) onProgress?.({ stage: 'Importing verses', done: i, total });
      }
      await flush();
      if (count === 0) throw new ImportError(`"${asset.name}" has no readable verses.`);
      await db.runAsync(
        `INSERT OR REPLACE INTO translations (id, name, abbr, lang, comments, verse_count, has_ot, has_nt, source_file, imported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        name,
        abbr,
        lang,
        plainComments(details.Comments).slice(0, 2000),
        count,
        hasOT ? 1 : 0,
        hasNT ? 1 : 0,
        asset.name,
        nowIso()
      );
    });
    onProgress?.({ stage: 'Done', done: total, total });
    notify('translations');
    return { id, name, verses: count };
  } finally {
    await src.closeAsync();
  }
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
