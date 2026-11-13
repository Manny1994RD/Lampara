import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ReadingStats } from '@/components/reading-stats';
import { Button, Card, Chip, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { BOOKS, TOTAL_CHAPTERS, bookName } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT } from '@/i18n';
import { clearBookReads, getAllReadCounts, markChaptersReadEarlier, undoLastRead } from '@/lib/data';
import { updateSettings } from '@/lib/settings';

export default function ProgressScreen() {
  const t = useTheme();
  const { lang } = useTranslations();
  const { t: tr, tn } = useT();
  const counts = useLive((db) => getAllReadCounts(db), [], ['reads']);
  const [testament, setTestament] = useState<'all' | 'OT' | 'NT'>('all');
  const [open, setOpen] = useState<number | null>(null);
  // Marking mode: tap chapters to select them (instead of opening them), then mark them all read at once.
  const [marking, setMarking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const db = useSQLiteContext();

  const pickedRefs = () =>
    picked.map((k) => {
      const [book, ch] = k.split(':').map(Number);
      return { book, ch };
    });
  const togglePick = (b: number, c: number) => {
    const k = `${b}:${c}`;
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };
  const pickBook = (b: number, chapters: number) => {
    const keys = Array.from({ length: chapters }, (_, i) => `${b}:${i + 1}`);
    const all = keys.every((k) => picked.includes(k));
    setPicked((p) => (all ? p.filter((k) => !keys.includes(k)) : [...new Set([...p, ...keys])]));
  };
  // Adds one read to each selected chapter (read again = darker color).
  const markPicked = async () => {
    await markChaptersReadEarlier(db, pickedRefs());
    setPicked([]);
  };
  // Takes one read away from each selected chapter.
  const unmarkPicked = async () => {
    for (const r of pickedRefs()) if (counts?.get(`${r.book}:${r.ch}`)) await undoLastRead(db, r.book, r.ch);
    setPicked([]);
  };
  const stopMarking = () => {
    setMarking(false);
    setPicked([]);
  };
  const clearBook = async (b: number) => {
    const title = tr('progress.clearBookTitle', { book: bookName(b, lang) });
    const body = tr('progress.clearBookBody');
    const ok =
      Platform.OS === 'web'
        ? window.confirm(`${title}

${body}`)
        : await new Promise<boolean>((resolve) =>
            Alert.alert(title, body, [
              { text: tr('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
              { text: tr('common.remove'), style: 'destructive', onPress: () => resolve(true) },
            ])
          );
    if (ok) clearBookReads(db, b);
  };

  const total = counts?.size ?? 0;

  // Each extra read makes the chapter a little darker: 1 read, 2 reads, 3 reads, 4+ reads.
  const shade = (n: number) => {
    if (!n) return t.cardAlt;
    const steps = ['5C', 'A3', 'D6', 'FF'];
    return t.accent + steps[Math.min(steps.length, n) - 1];
  };

  const open_ = (b: number, c: number) => {
    updateSettings({ book: b, chapter: c });
    router.navigate('/read');
  };

  return (
    <View style={{ flex: 1 }}>
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="title">{tr('tab.progress')}</Txt>
        <Button
          small
          kind={marking ? 'primary' : 'secondary'}
          icon={marking ? 'checkmark' : 'create-outline'}
          title={marking ? tr('progress.doneMarking') : tr('progress.mark')}
          onPress={() => (marking ? stopMarking() : setMarking(true))}
        />
      </Row>
      {!marking && (
        <View style={{ marginTop: 12 }}>
          <ReadingStats />
          <SectionTitle>{tr('progress.byBook')}</SectionTitle>
        </View>
      )}
      <Txt muted style={{ marginBottom: 14 }}>
        {tr('progress.readOnce', { done: total, total: TOTAL_CHAPTERS })}
      </Txt>
      {marking && (
        <Card style={{ marginBottom: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={20} color={t.accent} />
          <Txt variant="small" style={{ flex: 1 }}>
            {tr('progress.markHint')}
          </Txt>
        </Card>
      )}
      <Row style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <Chip label={tr('common.all')} selected={testament === 'all'} onPress={() => setTestament('all')} />
        <Chip label={tr('common.oldTestament')} selected={testament === 'OT'} onPress={() => setTestament('OT')} />
        <Chip label={tr('common.newTestament')} selected={testament === 'NT'} onPress={() => setTestament('NT')} />
      </Row>

      <View style={{ gap: 8 }}>
        {BOOKS.filter((b) => testament === 'all' || b.testament === testament).map((b) => {
          let done = 0;
          let reads = 0;
          for (let c = 1; c <= b.chapters; c++) {
            const n = counts?.get(`${b.n}:${c}`) ?? 0;
            if (n) done++;
            reads += n;
          }
          const isOpen = open === b.n;
          return (
            <Card key={b.n} style={{ paddingVertical: 12, gap: 8 }}>
              <Pressable onPress={() => setOpen(isOpen ? null : b.n)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="label" style={{ flex: 1 }}>
                    {bookName(b.n, lang)}
                  </Txt>
                  <Txt variant="small" muted>
                    {done}/{b.chapters}
                    {reads > done ? ` · ${tn('progress.reads', reads)}` : ''}
                  </Txt>
                </Row>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={done / b.chapters} color={done === b.chapters ? t.success : t.accent} />
                </View>
              </Pressable>
              {isOpen && marking && (
                <Row style={{ flexWrap: 'wrap' }} gap={6}>
                  <Button small kind="secondary" icon="checkbox-outline" title={tr('progress.selectBook')} onPress={() => pickBook(b.n, b.chapters)} />
                  <Button small kind="ghost" icon="close-circle-outline" title={tr('progress.clearBook')} disabled={!done} onPress={() => clearBook(b.n)} />
                </Row>
              )}
              {isOpen && (
                <View style={styles.grid}>
                  {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => {
                    const n = counts?.get(`${b.n}:${c}`) ?? 0;
                    const isPicked = marking && picked.includes(`${b.n}:${c}`);
                    return (
                      <Pressable
                        key={c}
                        onPress={() => (marking ? togglePick(b.n, c) : open_(b.n, c))}
                        accessibilityLabel={`${bookName(b.n, lang)} ${c}, read ${n} times`}
                        accessibilityState={{ selected: isPicked }}
                        style={({ pressed }) => [
                          styles.cell,
                          { backgroundColor: shade(n), opacity: pressed ? 0.7 : 1 },
                          marking && !n && !isPicked && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.textSecondary },
                          isPicked && { borderWidth: 3, borderColor: t.text, transform: [{ scale: 1.06 }] },
                        ]}>
                        <Txt variant="caption" style={{ fontWeight: '700' }} color={n ? t.onAccent : t.textSecondary}>
                          {c}
                        </Txt>
                        {n > 1 && (
                          <Txt variant="caption" color={t.onAccent} style={{ fontSize: 9, lineHeight: 10 }}>
                            ×{n}
                          </Txt>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>
          );
        })}
      </View>
      {/* Room for the selection bar */}
      {marking && picked.length > 0 && <View style={{ height: 90 }} />}
    </Screen>

    {marking && picked.length > 0 && (
      <View style={[styles.bar, { backgroundColor: t.card, borderColor: t.border }]}>
        <Row style={{ width: '100%', maxWidth: 900, alignSelf: 'center', flexWrap: 'wrap' }} gap={8}>
          <Txt variant="label" style={{ flex: 1, minWidth: 110 }}>
            {tr('progress.selected', { n: picked.length })}
          </Txt>
          <Button small icon="checkmark-done" title={tr('progress.markRead')} onPress={markPicked} />
          <Button small kind="secondary" icon="remove-circle-outline" title={tr('progress.removeRead')} onPress={unmarkPicked} />
          <Button small kind="ghost" icon="close" title={tr('progress.clearSelection')} onPress={() => setPicked([])} />
        </Row>
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  cell: { width: 40, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
});
