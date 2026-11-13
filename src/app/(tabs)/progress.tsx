import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Chip, ProgressBar, Row, Screen, Txt } from '@/components/ui';
import { BOOKS, TOTAL_CHAPTERS, bookName } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { getAllReadCounts } from '@/lib/data';
import { updateSettings } from '@/lib/settings';

export default function ProgressScreen() {
  const t = useTheme();
  const { lang } = useTranslations();
  const es = lang === 'es';
  const counts = useLive((db) => getAllReadCounts(db), [], ['reads']);
  const [testament, setTestament] = useState<'all' | 'OT' | 'NT'>('all');
  const [open, setOpen] = useState<number | null>(null);

  const total = counts?.size ?? 0;
  const maxCount = counts && counts.size ? Math.max(...counts.values()) : 1;

  const shade = (n: number) => {
    if (!n) return t.cardAlt;
    const steps = ['66', '99', 'CC', 'FF'];
    const idx = Math.min(steps.length - 1, Math.floor(((n - 1) / Math.max(1, maxCount - 1)) * (steps.length - 1)));
    return t.accent + (maxCount === 1 ? 'FF' : steps[idx]);
  };

  const open_ = (b: number, c: number) => {
    updateSettings({ book: b, chapter: c });
    router.navigate('/read');
  };

  return (
    <Screen>
      <Txt variant="title">{es ? 'Progreso' : 'Progress'}</Txt>
      <Txt muted style={{ marginBottom: 14 }}>
        {total} / {TOTAL_CHAPTERS} {es ? 'capítulos leídos al menos una vez' : 'chapters read at least once'}
      </Txt>
      <Row style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <Chip label={es ? 'Todo' : 'All'} selected={testament === 'all'} onPress={() => setTestament('all')} />
        <Chip label={es ? 'Antiguo T.' : 'Old Testament'} selected={testament === 'OT'} onPress={() => setTestament('OT')} />
        <Chip label={es ? 'Nuevo T.' : 'New Testament'} selected={testament === 'NT'} onPress={() => setTestament('NT')} />
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
                    {reads > done ? ` · ${reads} ${es ? 'lecturas' : 'reads'}` : ''}
                  </Txt>
                </Row>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={done / b.chapters} color={done === b.chapters ? t.success : t.accent} />
                </View>
              </Pressable>
              {isOpen && (
                <View style={styles.grid}>
                  {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => {
                    const n = counts?.get(`${b.n}:${c}`) ?? 0;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => open_(b.n, c)}
                        accessibilityLabel={`${bookName(b.n, lang)} ${c}, read ${n} times`}
                        style={({ pressed }) => [styles.cell, { backgroundColor: shade(n), opacity: pressed ? 0.7 : 1 }]}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  cell: { width: 40, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
