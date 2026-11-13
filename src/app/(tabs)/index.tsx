import { router } from 'expo-router';
import { View } from 'react-native';

import { ReadingHeatmap } from '@/components/heatmap';
import { ImportButton } from '@/components/import-button';
import { Button, Card, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt, useIsTablet } from '@/components/ui';
import { BOOKS, TOTAL_CHAPTERS, bookName, getBook } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { getAllReadCounts, getReadingStats } from '@/lib/data';
import { updateSettings, useSettings } from '@/lib/settings';

function greeting(es: boolean) {
  const h = new Date().getHours();
  if (es) return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening';
}

export default function TodayScreen() {
  const t = useTheme();
  const tablet = useIsTablet();
  const settings = useSettings();
  const { list, lang } = useTranslations();
  const es = lang === 'es';
  const stats = useLive((db) => getReadingStats(db), [], ['reads']);
  const counts = useLive((db) => getAllReadCounts(db), [], ['reads']);

  const distinct = counts ? counts.size : 0;
  const pct = distinct / TOTAL_CHAPTERS;
  // How many times the whole Bible has been completed = the least-read chapter's count.
  let completions = 0;
  if (counts && counts.size === TOTAL_CHAPTERS) {
    completions = Math.min(...counts.values());
  }

  // Next unread chapter after the last one read.
  const nextUp = (() => {
    const start = stats?.lastRead ?? { book: settings.book, ch: settings.chapter - 1 };
    let b = start.book;
    let c = start.ch + 1;
    if (c > getBook(b).chapters) {
      b = b === 66 ? 1 : b + 1;
      c = 1;
    }
    return { book: b, ch: c };
  })();

  const continueReading = (b: number, c: number) => {
    updateSettings({ book: b, chapter: c });
    router.navigate('/read');
  };

  const statTiles = [
    { icon: 'flame' as const, value: stats?.streak ?? 0, label: es ? 'Racha (días)' : 'Day streak' },
    { icon: 'today' as const, value: stats?.todayReads ?? 0, label: es ? 'Capítulos hoy' : 'Chapters today' },
    { icon: 'library' as const, value: stats?.totalReads ?? 0, label: es ? 'Lecturas totales' : 'Total chapter reads' },
    { icon: 'trophy' as const, value: stats?.bestStreak ?? 0, label: es ? 'Mejor racha' : 'Best streak' },
  ];

  return (
    <Screen>
      <Txt muted variant="small">
        {new Date().toLocaleDateString(es ? 'es' : 'en', { weekday: 'long', month: 'long', day: 'numeric' })}
      </Txt>
      <Txt variant="title" style={{ marginTop: 2 }}>
        {greeting(es)}
      </Txt>

      {list && list.length === 0 && (
        <Card style={{ marginTop: 18, gap: 12 }}>
          <Row>
            <Ionicons name="book" size={22} color={t.accent} />
            <Txt variant="heading">Welcome to Lámpara</Txt>
          </Row>
          <Txt muted>
            Start by importing one of your e-Sword Bibles (.bblx). You can import as many translations as you like —
            they stay on this device.
          </Txt>
          <ImportButton />
        </Card>
      )}

      {/* Continue */}
      <Card style={{ marginTop: 18, gap: 10 }} onPress={() => continueReading(nextUp.book, nextUp.ch)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="caption" muted style={{ textTransform: 'uppercase', fontWeight: '700' }}>
              {stats?.lastRead ? (es ? 'Sigue leyendo' : 'Up next') : es ? 'Empieza aquí' : 'Start here'}
            </Txt>
            <Txt variant="title" style={{ fontSize: 24 }}>
              {bookName(nextUp.book, lang)} {nextUp.ch}
            </Txt>
            {stats?.lastRead && (
              <Txt variant="small" muted>
                {es ? 'Último leído: ' : 'Last read: '}
                {bookName(stats.lastRead.book, lang)} {stats.lastRead.ch}
              </Txt>
            )}
          </View>
          <Ionicons name="arrow-forward-circle" size={40} color={t.accent} />
        </Row>
      </Card>

      {/* Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {statTiles.map((s) => (
          <Card key={s.label} style={{ flexGrow: 1, flexBasis: tablet ? '22%' : '45%', gap: 4 }}>
            <Ionicons name={s.icon} size={20} color={t.accent} />
            <Txt variant="title" style={{ fontSize: 26 }}>
              {s.value}
            </Txt>
            <Txt variant="small" muted>
              {s.label}
            </Txt>
          </Card>
        ))}
      </View>

      <SectionTitle>{es ? 'Toda la Biblia' : 'Whole Bible'}</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">
            {distinct} / {TOTAL_CHAPTERS} {es ? 'capítulos' : 'chapters'}
          </Txt>
          <Txt variant="label" color={t.accent}>
            {(pct * 100).toFixed(1)}%
          </Txt>
        </Row>
        <ProgressBar value={pct} height={10} />
        <Txt variant="small" muted>
          {completions > 0
            ? es
              ? `Has leído toda la Biblia ${completions} ${completions === 1 ? 'vez' : 'veces'} 🎉`
              : `You've read the whole Bible ${completions} ${completions === 1 ? 'time' : 'times'} 🎉`
            : es
              ? `Antiguo Testamento: ${countIn(counts, 'OT')} / 929 · Nuevo: ${countIn(counts, 'NT')} / 260`
              : `Old Testament: ${countIn(counts, 'OT')} / 929 · New: ${countIn(counts, 'NT')} / 260`}
        </Txt>
        <Button kind="secondary" small title={es ? 'Ver progreso por libro' : 'See progress by book'} onPress={() => router.navigate('/progress')} style={{ alignSelf: 'flex-start' }} />
      </Card>

      <SectionTitle>{es ? 'Días de lectura' : 'Reading days'}</SectionTitle>
      <Card>
        <ReadingHeatmap days={stats?.days ?? new Map()} weeks={tablet ? 30 : 18} />
      </Card>
    </Screen>
  );
}

function countIn(counts: Map<string, number> | undefined, testament: 'OT' | 'NT') {
  if (!counts) return 0;
  let n = 0;
  for (const b of BOOKS) {
    if (b.testament !== testament) continue;
    for (let c = 1; c <= b.chapters; c++) if (counts.get(`${b.n}:${c}`)) n++;
  }
  return n;
}
