import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Ionicons, Sheet, Txt } from '@/components/ui';
import { bookAbbr, refLabel, type Lang } from '@/data/books';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { useT, type TKey } from '@/i18n';
import { getNotes, type CommentaryKind, type Note } from '@/lib/commentaries';
import type { VerseRef } from '@/lib/data';
import { splitRefs } from '@/lib/esword-refs';
import { buildSegments } from '@/lib/segments';

const ORDER: CommentaryKind[] = ['refs', 'notes'];
const TITLE: Record<CommentaryKind, TKey> = { refs: 'notes.kind.refs', notes: 'notes.kind.notes', commentary: 'notes.kind.commentary' };
const LONG = 600;

/** Tap a verse → Notas: cross-references (tappable), the version's notes and commentaries from the church library. */
export function NotesSheet({
  verseRef,
  lang,
  onClose,
  onGo,
}: {
  verseRef: VerseRef | null;
  lang: Lang;
  onClose: () => void;
  /** Open a referenced verse. */
  onGo: (book: number, ch: number, v: number) => void;
}) {
  const t = useTheme();
  const { t: tr } = useT();
  const key = verseRef ? `${verseRef.book}:${verseRef.ch}:${verseRef.v}` : '';
  const notes = useRemote(async () => (verseRef ? getNotes(verseRef.book, verseRef.ch, verseRef.v) : []), [key], ['hub']);

  const items = notes.data ?? [];
  // Notes about exactly this verse, and notes about a longer passage (shown after, folded).
  const isVerse = (n: Note) => n.ch1 === n.ch2 && n.v1 === n.v2 && n.v1 > 0;
  const groups = ORDER.map((k) => ({
    kind: k,
    verse: items.filter((n) => n.kind === k && isVerse(n)),
    passage: items.filter((n) => n.kind === k && !isVerse(n)),
  })).filter((g) => g.verse.length || g.passage.length);

  return (
    <Sheet visible={!!verseRef} onClose={onClose} title={verseRef ? `${tr('notes.title')} · ${refLabel(verseRef.book, verseRef.ch, verseRef.v, lang)}` : ''}>
      {notes.loading && !notes.data ? (
        <ActivityIndicator style={{ marginVertical: 24 }} color={t.textSecondary} />
      ) : notes.error ? (
        <Txt variant="small" color={t.danger}>
          {notes.error}
        </Txt>
      ) : groups.length === 0 ? (
        <Txt muted style={{ marginVertical: 12 }}>
          {tr('notes.empty')}
        </Txt>
      ) : (
        <View style={{ gap: 18 }}>
          {groups.map((g) => (
            <View key={g.kind} style={{ gap: 10 }}>
              <Txt variant="caption" muted style={styles.kicker}>
                {tr(TITLE[g.kind])}
              </Txt>
              {g.verse.map((n, i) => (
                <NoteCard key={`v${i}`} note={n} lang={lang} onGo={onGo} />
              ))}
              {g.passage.length > 0 && <PassageNotes notes={g.passage} lang={lang} onGo={onGo} />}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

/** Notes that cover a whole passage or chapter: folded by default, since they repeat on every verse. */
function PassageNotes({ notes, lang, onGo }: { notes: Note[]; lang: Lang; onGo: (b: number, c: number, v: number) => void }) {
  const t = useTheme();
  const { t: tr } = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" style={[styles.fold, { borderColor: t.border }]}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={t.textSecondary} />
        <Txt variant="small" style={{ fontWeight: '700', flex: 1 }}>
          {tr('notes.passage', { n: notes.length })}
        </Txt>
      </Pressable>
      {open && notes.map((n, i) => <NoteCard key={i} note={n} lang={lang} onGo={onGo} />)}
    </View>
  );
}

function NoteCard({ note, lang, onGo }: { note: Note; lang: Lang; onGo: (b: number, c: number, v: number) => void }) {
  const t = useTheme();
  const { t: tr } = useT();
  const long = note.text.length > LONG;
  const [more, setMore] = useState(false);
  const shown = long && !more ? cut(note.text) : note.text;
  const segs = buildSegments(shown, note.marks.filter((m) => m.s < shown.length), []);
  const span =
    note.v1 === 0
      ? tr('notes.chapter', { ch: note.ch1 })
      : note.ch1 !== note.ch2
        ? `${note.ch1}:${note.v1}–${note.ch2}:${note.v2}`
        : note.v1 !== note.v2
          ? `${note.ch1}:${note.v1}–${note.v2}`
          : '';

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <Txt variant="caption" color={t.accent} style={{ fontWeight: '800' }} numberOfLines={1}>
        {note.name}
        {span ? ` · ${span}` : ''}
      </Txt>
      <Text style={[styles.body, { color: t.text }]}>
        {segs.map((s, si) =>
          splitRefs(s.text).map((p, pi) =>
            p.ref ? (
              <Text
                key={`${si}-${pi}`}
                onPress={() => onGo(p.ref!.book, p.ref!.ch, p.ref!.v)}
                accessibilityRole="link"
                style={{ color: t.accent, fontWeight: '700' }}>
                {`${bookAbbr(p.ref.book, lang)} ${p.ref.ch}:${p.ref.v}${p.ref.v2 ? `–${p.ref.v2}` : ''}`}
              </Text>
            ) : (
              <Text key={`${si}-${pi}`} style={[s.bold && { fontWeight: '700' }, s.italic && { fontStyle: 'italic' }]}>
                {p.text}
              </Text>
            )
          )
        )}
        {long && !more ? '…' : ''}
      </Text>
      {long && (
        <Pressable onPress={() => setMore((m) => !m)} hitSlop={8}>
          <Txt variant="small" color={t.accent} style={{ fontWeight: '700' }}>
            {more ? tr('notes.less') : tr('notes.more')}
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

/** The first part of a long note, ending at a word. */
function cut(text: string) {
  const s = text.slice(0, LONG);
  const sp = s.lastIndexOf(' ');
  return sp > LONG * 0.7 ? s.slice(0, sp) : s;
}

const styles = StyleSheet.create({
  kicker: { textTransform: 'uppercase', fontWeight: '800' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 6 },
  body: { fontSize: 15, lineHeight: 22 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10 },
});
