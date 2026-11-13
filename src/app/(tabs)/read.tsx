import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImportButton } from '@/components/import-button';
import { ChapterPicker } from '@/components/reader/chapter-picker';
import { NoteSheet, TopicSheet, WordHighlightSheet } from '@/components/reader/verse-sheets';
import {
  Button,
  Card,
  ColorSwatches,
  Empty,
  IconButton,
  Ionicons,
  Row,
  Sheet,
  Txt,
  highlightBg,
  useIsTablet,
} from '@/components/ui';
import { Fonts, ReaderMaxWidth } from '@/constants/theme';
import { bookName, getBook } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import {
  getChapter,
  getChapterBookmarks,
  getChapterHighlights,
  getChapterNotes,
  getChapterReadCount,
  getChapterTopicVerses,
  markChapterRead,
  setVerseHighlight,
  toggleBookmark,
  undoLastRead,
  type Verse,
  type VerseRef,
} from '@/lib/data';
import { getActivePlanProgress } from '@/lib/plans';
import { buildSegments } from '@/lib/segments';
import { updateSettings, useSettings } from '@/lib/settings';

export default function ReadScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tablet = useIsTablet();
  const settings = useSettings();
  const { list, current, lang } = useTranslations();
  const es = lang === 'es';
  const { book, chapter } = settings;
  const tr = current?.id ?? null;

  const verses = useLive((d) => (tr ? getChapter(d, tr, book, chapter) : Promise.resolve([])), [tr, book, chapter], ['translations']);
  const highlights = useLive((d) => getChapterHighlights(d, book, chapter), [book, chapter], ['highlights']);
  const bookmarks = useLive(async (d) => new Set((await getChapterBookmarks(d, book, chapter)).map((r) => r.v)), [book, chapter], ['bookmarks']);
  const notes = useLive(async (d) => new Map((await getChapterNotes(d, book, chapter)).map((n) => [n.v, n.body])), [book, chapter], ['notes']);
  const topicDots = useLive(async (d) => new Map((await getChapterTopicVerses(d, book, chapter)).map((r) => [r.v, r.color])), [book, chapter], ['topics']);
  const readInfo = useLive((d) => getChapterReadCount(d, book, chapter), [book, chapter], ['reads']);
  // Next unread chapter in the active reading plan (shown after marking this one read).
  const planNext = useLive(
    async (d) => {
      const plan = (await getActivePlanProgress(d))[0];
      const c = plan?.nextDay?.chapters.find((x) => !x.done);
      return plan && c ? { name: plan.plan.name, ...c } : null;
    },
    [],
    ['plans', 'reads']
  );

  // Selection is tied to the chapter it was made in, so it clears automatically when the chapter changes.
  const chapterKey = `${tr}:${book}:${chapter}`;
  const [selection, setSelection] = useState<{ key: string; verses: number[] }>({ key: '', verses: [] });
  const selected = selection.key === chapterKey ? selection.verses : [];
  const setSelected = (fn: number[] | ((s: number[]) => number[])) =>
    setSelection({ key: chapterKey, verses: typeof fn === 'function' ? fn(selected) : fn });
  const [picker, setPicker] = useState(false);
  const [trPicker, setTrPicker] = useState(false);
  const [fontSheet, setFontSheet] = useState(false);
  const [wordVerse, setWordVerse] = useState<Verse | null>(null);
  const [noteRef, setNoteRef] = useState<VerseRef | null>(null);
  const [topicRefs, setTopicRefs] = useState<VerseRef[] | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [chapterKey]);

  const go = (b: number, c: number) => updateSettings({ book: b, chapter: c });
  const prev = () => {
    if (chapter > 1) go(book, chapter - 1);
    else if (book > 1) go(book - 1, getBook(book - 1).chapters);
  };
  const next = () => {
    if (chapter < getBook(book).chapters) go(book, chapter + 1);
    else if (book < 66) go(book + 1, 1);
  };

  const selRefs: VerseRef[] = selected.map((v) => ({ book, ch: chapter, v }));
  const toggle = (v: number) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v].sort((a, b) => a - b)));

  // Group verses into paragraphs.
  const paragraphs = useMemo(() => {
    const out: Verse[][] = [];
    let cur: Verse[] = [];
    (verses ?? []).forEach((v) => {
      cur.push(v);
      if (v.para) {
        out.push(cur);
        cur = [];
      }
    });
    if (cur.length) out.push(cur);
    // Translations without paragraph info: one verse per line reads better.
    if (out.length === 1 && (verses?.length ?? 0) > 1) return (verses ?? []).map((v) => [v]);
    return out;
  }, [verses]);

  if (list && list.length === 0) {
    return (
      <View style={[styles.flex, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <Empty
          icon="book"
          title="Add your first Bible"
          body="Import an e-Sword Bible file (.bblx) from your device. It stays on this device only."
          action={<View style={{ marginTop: 12 }}><ImportButton /></View>}
        />
      </View>
    );
  }

  const fontSize = settings.fontSize;
  const verseHl = (v: number) => highlights?.find((h) => h.v === v && h.start == null)?.color ?? null;
  const wordHls = (v: number) => (highlights ?? []).filter((h) => h.v === v && h.tr === tr && h.start != null);
  const selectedText = () =>
    (verses ?? [])
      .filter((v) => selected.includes(v.v))
      .map((v) => `${v.v} ${v.text}`)
      .join(' ');
  const selLabel = selected.length
    ? `${bookName(book, lang)} ${chapter}:${selected.length === 1 ? selected[0] : `${selected[0]}–${selected[selected.length - 1]}`}`
    : '';

  return (
    <View style={[styles.flex, { backgroundColor: t.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderColor: t.border, backgroundColor: t.background }]}>
        <View style={[styles.headerInner, { maxWidth: ReaderMaxWidth + 80 }]}>
          <Pressable onPress={() => setPicker(true)} style={({ pressed }) => [styles.refButton, { backgroundColor: t.cardAlt, opacity: pressed ? 0.7 : 1 }]}>
            <Txt variant="label" numberOfLines={1}>
              {bookName(book, lang)} {chapter}
            </Txt>
            <Ionicons name="chevron-down" size={16} color={t.textSecondary} />
          </Pressable>
          <Pressable onPress={() => setTrPicker(true)} style={({ pressed }) => [styles.trButton, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
            <Txt variant="small" style={{ fontWeight: '700' }} numberOfLines={1}>
              {current?.abbr ?? '…'}
            </Txt>
          </Pressable>
          <View style={{ flex: 1 }} />
          <IconButton icon="search" label="Search" onPress={() => router.push('/search')} />
          <IconButton icon="text" label="Text size" onPress={() => setFontSheet(true)} />
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: selected.length ? 220 : 60 }}>
        <View style={[styles.page, { maxWidth: ReaderMaxWidth, paddingHorizontal: tablet ? 40 : 20 }]}>
          <Text style={[styles.chapterTitle, { color: t.text, fontFamily: Fonts.serif }]}>
            {bookName(book, lang)} {chapter}
          </Text>

          {verses === undefined ? null : verses.length === 0 ? (
            <Txt muted style={{ marginVertical: 30 }}>
              {es
                ? `${current?.abbr} no incluye este capítulo.`
                : `${current?.abbr} doesn't include this chapter.`}
            </Txt>
          ) : (
            paragraphs.map((para, pi) => (
              <Text key={pi} style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.65, color: t.text, fontFamily: Fonts.serif }]}>
                {para.map((v) => {
                  const isSel = selected.includes(v.v);
                  const vColor = verseHl(v.v);
                  const segs = buildSegments(v.text, v.marks, wordHls(v.v));
                  return (
                    <Text
                      key={v.v}
                      onPress={() => toggle(v.v)}
                      suppressHighlighting
                      style={[
                        isSel && { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: t.accent },
                      ]}>
                      <Text style={[styles.verseNum, { color: t.accent, fontSize: fontSize * 0.62 }]}>
                        {' '}
                        {v.v}
                        {' '}
                      </Text>
                      {segs.map((s, si) => {
                        const bg = s.color ?? vColor;
                        return (
                          <Text
                            key={si}
                            style={[
                              bg && { backgroundColor: highlightBg(bg, t.dark) },
                              s.italic && { fontStyle: 'italic' },
                              s.bold && { fontWeight: '700' },
                            ]}>
                            {s.text}
                          </Text>
                        );
                      })}
                      {bookmarks?.has(v.v) && <Text style={{ color: t.accent }}> ◆</Text>}
                      {notes?.has(v.v) && <Text style={{ color: t.accent }}> ✎</Text>}
                      {topicDots?.has(v.v) && (
                        <Text style={{ color: highlightBg(topicDots.get(v.v)!, !t.dark) }}> ●</Text>
                      )}
                    </Text>
                  );
                })}
              </Text>
            ))
          )}

          {/* Mark as read */}
          {!!verses?.length && (
            <Card style={{ marginTop: 28, gap: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="label">
                    {readInfo?.count
                      ? es
                        ? `Leído ${readInfo.count} ${readInfo.count === 1 ? 'vez' : 'veces'}`
                        : `Read ${readInfo.count} ${readInfo.count === 1 ? 'time' : 'times'}`
                      : es
                        ? 'Aún no lo has marcado'
                        : 'Not marked as read yet'}
                  </Txt>
                  {readInfo?.last && (
                    <Txt variant="small" muted>
                      {es ? 'Última vez: ' : 'Last: '}
                      {new Date(readInfo.last).toLocaleDateString()}
                    </Txt>
                  )}
                </View>
                {!!readInfo?.count && (
                  <IconButton icon="arrow-undo" label="Undo last read" onPress={() => undoLastRead(db, book, chapter)} />
                )}
              </Row>
              <Button
                icon="checkmark-done"
                title={
                  readInfo?.count
                    ? es
                      ? 'Lo leí otra vez'
                      : 'I read it again'
                    : es
                      ? 'Marcar capítulo como leído'
                      : 'Mark chapter as read'
                }
                onPress={async () => {
                  await markChapterRead(db, book, chapter, tr);
                }}
              />
              {!!readInfo?.count && planNext && !(planNext.book === book && planNext.ch === chapter) && (
                <Button
                  kind="secondary"
                  icon="arrow-forward"
                  title={`${es ? 'Siguiente en tu plan' : 'Next in your plan'}: ${bookName(planNext.book, lang)} ${planNext.ch}`}
                  onPress={() => go(planNext.book, planNext.ch)}
                />
              )}
            </Card>
          )}

          <Row style={{ justifyContent: 'space-between', marginTop: 18 }}>
            <Button kind="ghost" icon="chevron-back" title={es ? 'Anterior' : 'Previous'} onPress={prev} disabled={book === 1 && chapter === 1} />
            <Button kind="ghost" title={es ? 'Siguiente' : 'Next'} onPress={next} disabled={book === 66 && chapter === 22} />
          </Row>
        </View>
      </ScrollView>

      {/* Verse action bar */}
      {selected.length > 0 && (
        <View style={[styles.actionBar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: 12 }]}>
          <View style={{ width: '100%', maxWidth: ReaderMaxWidth, alignSelf: 'center', gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="label">{selLabel}</Txt>
              <IconButton icon="close" label="Clear selection" onPress={() => setSelected([])} />
            </Row>
            <ColorSwatches
              allowNone
              value={selected.length === 1 ? verseHl(selected[0]) : null}
              onChange={async (c) => {
                await setVerseHighlight(db, selRefs, c);
                setSelected([]);
              }}
            />
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {selected.length === 1 && tr && (
                <Button small kind="secondary" icon="color-wand" title={es ? 'Palabras' : 'Words'} onPress={() => setWordVerse(verses?.find((v) => v.v === selected[0]) ?? null)} />
              )}
              {selected.length === 1 && (
                <Button
                  small
                  kind="secondary"
                  icon={bookmarks?.has(selected[0]) ? 'bookmark' : 'bookmark-outline'}
                  title={es ? 'Marcador' : 'Bookmark'}
                  onPress={() => toggleBookmark(db, selRefs[0])}
                />
              )}
              {selected.length === 1 && (
                <Button small kind="secondary" icon="create-outline" title={es ? 'Nota' : 'Note'} onPress={() => setNoteRef(selRefs[0])} />
              )}
              <Button small kind="secondary" icon="pricetags-outline" title={es ? 'Tema' : 'Topic'} onPress={() => setTopicRefs(selRefs)} />
              <Button
                small
                kind="secondary"
                icon="share-outline"
                title={es ? 'Compartir' : 'Share'}
                onPress={() => {
                  const message = `${selectedText()}\n— ${selLabel} (${current?.abbr})`;
                  if (Platform.OS === 'web' && !navigator.share) navigator.clipboard?.writeText(message);
                  else Share.share({ message });
                }}
              />
            </Row>
          </View>
        </View>
      )}

      <ChapterPicker visible={picker} onClose={() => setPicker(false)} lang={lang} book={book} onPick={go} />

      <Sheet visible={trPicker} onClose={() => setTrPicker(false)} title={es ? 'Traducción' : 'Translation'}>
        {(list ?? []).map((x) => (
          <Pressable
            key={x.id}
            onPress={() => {
              updateSettings({ translationId: x.id });
              setTrPicker(false);
            }}
            style={({ pressed }) => [styles.trRow, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{x.abbr}</Txt>
              <Txt variant="small" muted numberOfLines={1}>
                {x.name}
              </Txt>
            </View>
            {x.id === tr && <Ionicons name="checkmark-circle" size={22} color={t.accent} />}
          </Pressable>
        ))}
        <View style={{ marginTop: 16 }}>
          <ImportButton label={es ? 'Importar otra Biblia' : 'Import another Bible'} />
        </View>
      </Sheet>

      <Sheet visible={fontSheet} onClose={() => setFontSheet(false)} title={es ? 'Tamaño del texto' : 'Text size'}>
        <Row style={{ justifyContent: 'center', gap: 24 }}>
          <IconButton icon="remove-circle-outline" size={34} label="Smaller" onPress={() => updateSettings({ fontSize: Math.max(13, fontSize - 1) })} />
          <Txt variant="title">{fontSize}</Txt>
          <IconButton icon="add-circle-outline" size={34} label="Bigger" onPress={() => updateSettings({ fontSize: Math.min(34, fontSize + 1) })} />
        </Row>
        <Txt variant="serif" style={{ fontSize, lineHeight: fontSize * 1.6, marginTop: 16 }}>
          {es ? 'Lámpara es a mis pies tu palabra.' : 'Your word is a lamp to my feet.'}
        </Txt>
      </Sheet>

      {tr && (
        <WordHighlightSheet
          key={wordVerse ? `word-${wordVerse.book}:${wordVerse.ch}:${wordVerse.v}` : 'word-none'}
          verse={wordVerse}
          tr={tr}
          lang={lang}
          highlights={highlights ?? []}
          onClose={() => {
            setWordVerse(null);
            setSelected([]);
          }}
        />
      )}
      <NoteSheet
        key={noteRef ? `note-${noteRef.book}:${noteRef.ch}:${noteRef.v}` : 'note-none'}
        verseRef={noteRef}
        initial={noteRef ? (notes?.get(noteRef.v) ?? '') : ''}
        lang={lang}
        onClose={() => {
          setNoteRef(null);
          setSelected([]);
        }}
      />
      <TopicSheet
        refs={topicRefs}
        lang={lang}
        onClose={() => {
          setTopicRefs(null);
          setSelected([]);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingBottom: 8 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', alignSelf: 'center' },
  refButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, flexShrink: 1 },
  trButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, maxWidth: 110 },
  page: { width: '100%', alignSelf: 'center', paddingTop: 18 },
  chapterTitle: { fontSize: 30, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  paragraph: { marginBottom: 10 },
  verseNum: { fontWeight: '700', fontFamily: Platform.select({ web: 'var(--font-display)', default: undefined }) },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  trRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
