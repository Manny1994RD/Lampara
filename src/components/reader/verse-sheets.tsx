import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, ColorSwatches, Ionicons, Row, Sheet, Txt, highlightBg } from '@/components/ui';
import type { HighlightColor } from '@/constants/theme';
import { refLabel, type Lang } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import {
  addWordHighlight,
  clearWordHighlights,
  createTopic,
  getTopics,
  getVerseTopicIds,
  saveNote,
  setVerseInTopic,
  type Highlight,
  type Verse,
  type VerseRef,
} from '@/lib/data';
import { buildSegments, tokenize } from '@/lib/segments';

/* --------------------------- word highlighter --------------------------- */

export function WordHighlightSheet({
  verse,
  tr,
  lang,
  highlights,
  onClose,
}: {
  verse: Verse | null;
  tr: string;
  lang: Lang;
  highlights: Highlight[];
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: L } = useT();
  const [range, setRange] = useState<[number, number] | null>(null);
  const [color, setColor] = useState<HighlightColor>('yellow');

  if (!verse) return null;

  const words = tokenize(verse.text);
  const mine = highlights.filter((h) => h.v === verse.v && h.tr === tr && h.start != null);
  const segs = buildSegments(verse.text, [], mine);
  const colorAt = (s: number) => segs.find((g) => g.start <= s && s < g.start + g.text.length)?.color ?? null;

  const tap = (i: number) => {
    if (!range) setRange([i, i]);
    else if (range[0] === range[1] && i !== range[0]) setRange([Math.min(range[0], i), Math.max(range[0], i)]);
    else setRange([i, i]);
  };

  const save = async () => {
    if (!range) return;
    await addWordHighlight(db, verse, tr, words[range[0]].s, words[range[1]].e, color);
    setRange(null);
  };
  return (
    <Sheet visible onClose={onClose} title={L('words.title', { ref: refLabel(verse.book, verse.ch, verse.v, lang) })}>
      <Txt muted variant="small" style={{ marginBottom: 12 }}>
        {L('words.hint')}
      </Txt>
      <View style={styles.words}>
        {words.map((w, i) => {
          const inRange = range && i >= range[0] && i <= range[1];
          const existing = colorAt(w.s);
          return (
            <Pressable
              key={i}
              onPress={() => tap(i)}
              style={[
                styles.word,
                {
                  backgroundColor: inRange ? highlightBg(color, t.dark) : existing ? highlightBg(existing, t.dark) : 'transparent',
                  borderColor: inRange ? t.text : 'transparent',
                },
              ]}>
              <Txt variant="serif" style={{ fontSize: 18, lineHeight: 26 }}>
                {w.word}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt variant="label" style={{ marginTop: 18, marginBottom: 10 }}>
        {L('words.color')}
      </Txt>
      <ColorSwatches value={color} onChange={(c) => c && setColor(c)} />
      <Row style={{ marginTop: 20, flexWrap: 'wrap' }}>
        <Button title={L('words.highlight')} icon="color-wand" disabled={!range} onPress={save} />
        {mine.length > 0 && (
          <Button
            title={L('words.clear')}
            kind="ghost"
            onPress={() => clearWordHighlights(db, verse, tr)}
          />
        )}
      </Row>
    </Sheet>
  );
}

/* --------------------------------- note --------------------------------- */

export function NoteSheet({
  verseRef,
  initial,
  lang,
  onClose,
}: {
  verseRef: VerseRef | null;
  initial: string;
  lang: Lang;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: L } = useT();
  const [body, setBody] = useState(initial);
  if (!verseRef) return null;
  const save = async () => {
    await saveNote(db, verseRef, body);
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={`${L('read.note')} · ${refLabel(verseRef.book, verseRef.ch, verseRef.v, lang)}`}>
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        autoFocus
        placeholder={L('note.placeholder')}
        placeholderTextColor={t.textSecondary}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
      />
      <Row style={{ marginTop: 14 }}>
        <Button title={L('common.save')} icon="checkmark" onPress={save} />
        {!!initial && <Button title={L('note.delete')} kind="danger" onPress={() => { setBody(''); saveNote(db, verseRef, '').then(onClose); }} />}
      </Row>
    </Sheet>
  );
}

/* -------------------------------- topics -------------------------------- */

export function TopicSheet({ refs, lang, onClose }: { refs: VerseRef[] | null; lang: Lang; onClose: () => void }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: L, tn } = useT();
  const topics = useLive((d) => getTopics(d), [], ['topics']);
  const first = refs?.[0];
  const memberOf = useLive(
    async (d) => (first ? new Set((await getVerseTopicIds(d, first)).map((r) => r.topic_id)) : new Set<string>()),
    [first?.book, first?.ch, first?.v],
    ['topics']
  );
  const [name, setName] = useState('');
  const [color, setColor] = useState<HighlightColor>('blue');
  if (!refs || !first) return null;

  const add = async () => {
    if (!name.trim()) return;
    const id = await createTopic(db, name, color);
    await setVerseInTopic(db, id, refs, true);
    setName('');
  };

  const label =
    refs.length === 1 ? refLabel(first.book, first.ch, first.v, lang) : tn('common.verses', refs.length);

  return (
    <Sheet visible onClose={onClose} title={`${L('library.topics')} · ${label}`}>
      {topics?.length ? (
        topics.map((tp) => {
          const on = memberOf?.has(tp.id) ?? false;
          return (
            <Pressable
              key={tp.id}
              onPress={() => setVerseInTopic(db, tp.id, refs, !on)}
              style={({ pressed }) => [styles.topicRow, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.topicDot, { backgroundColor: highlightBg(tp.color, t.dark) }]} />
              <Txt variant="label" style={{ flex: 1 }}>
                {tp.name}
              </Txt>
              <Txt muted variant="small">
                {tp.count}
              </Txt>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? t.accent : t.textSecondary} />
            </Pressable>
          );
        })
      ) : (
        <Txt muted style={{ marginBottom: 8 }}>
          {L('topics.empty')}
        </Txt>
      )}
      <Txt variant="label" style={{ marginTop: 18, marginBottom: 8 }}>
        {L('topics.new')}
      </Txt>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={L('topics.name')}
        placeholderTextColor={t.textSecondary}
        onSubmitEditing={add}
        style={[styles.inputLine, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
      />
      <View style={{ marginTop: 12 }}>
        <ColorSwatches value={color} onChange={(c) => c && setColor(c)} />
      </View>
      <Button title={L('topics.createAdd')} icon="add" onPress={add} disabled={!name.trim()} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  word: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, borderWidth: 1.5 },
  input: { minHeight: 160, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  inputLine: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topicDot: { width: 16, height: 16, borderRadius: 8 },
});
