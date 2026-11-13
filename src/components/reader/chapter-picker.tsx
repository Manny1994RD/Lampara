import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Row, Sheet, Txt } from '@/components/ui';
import { BOOKS, bookName, type Lang } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { getAllReadCounts } from '@/lib/data';

export function ChapterPicker({
  visible,
  onClose,
  lang,
  book,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  lang: Lang;
  book: number;
  onPick: (book: number, chapter: number) => void;
}) {
  const t = useTheme();
  const { t: L } = useT();
  const [testament, setTestament] = useState<'OT' | 'NT'>(book >= 40 ? 'NT' : 'OT');
  const [selected, setSelected] = useState<number | null>(null);
  const counts = useLive((db) => getAllReadCounts(db), [], ['reads']);

  const close = () => {
    setSelected(null);
    onClose();
  };

  const selBook = selected ? BOOKS[selected - 1] : null;

  return (
    <Sheet visible={visible} onClose={close} title={selBook ? bookName(selBook.n, lang) : L('picker.books')}>
      {!selBook ? (
        <>
          <Row style={{ marginBottom: 12 }}>
            <Chip label={L('common.oldTestament')} selected={testament === 'OT'} onPress={() => setTestament('OT')} />
            <Chip label={L('common.newTestament')} selected={testament === 'NT'} onPress={() => setTestament('NT')} />
          </Row>
          <View style={styles.bookGrid}>
            {BOOKS.filter((b) => b.testament === testament).map((b) => {
              let done = 0;
              for (let c = 1; c <= b.chapters; c++) if (counts?.get(`${b.n}:${c}`)) done++;
              const complete = done === b.chapters;
              return (
                <Pressable
                  key={b.n}
                  onPress={() => (b.chapters === 1 ? (onPick(b.n, 1), close()) : setSelected(b.n))}
                  style={({ pressed }) => [
                    styles.book,
                    {
                      backgroundColor: b.n === book ? t.accentSoft : t.cardAlt,
                      borderColor: complete ? t.success : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Txt variant="label" numberOfLines={1}>
                    {bookName(b.n, lang)}
                  </Txt>
                  <Txt variant="caption" muted>
                    {done}/{b.chapters}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Pressable onPress={() => setSelected(null)} style={{ marginBottom: 12 }}>
            <Txt color={t.accent} variant="label">
              ‹ {L('picker.allBooks')}
            </Txt>
          </Pressable>
          <View style={styles.chGrid}>
            {Array.from({ length: selBook.chapters }, (_, i) => i + 1).map((c) => {
              const n = counts?.get(`${selBook.n}:${c}`) ?? 0;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    onPick(selBook.n, c);
                    close();
                  }}
                  style={({ pressed }) => [
                    styles.ch,
                    { backgroundColor: n > 0 ? t.accent : t.cardAlt, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Txt variant="label" color={n > 0 ? t.onAccent : t.text}>
                    {c}
                  </Txt>
                  {n > 1 && (
                    <Txt variant="caption" color={t.onAccent} style={{ fontSize: 10, lineHeight: 12 }}>
                      ×{n}
                    </Txt>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  book: {
    width: '48%',
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  chGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ch: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
