import { router } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';

import { ReadingHeatmap } from '@/components/heatmap';
import { Button, Card, Ionicons, ProgressBar, Row, SectionTitle, Txt, useIsTablet } from '@/components/ui';
import { BOOKS, TOTAL_CHAPTERS } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { getBadges } from '@/lib/badges';
import { GRACE_EVERY, getAllReadCounts, getReadingStats } from '@/lib/data';

/** Streaks, whole-Bible progress, reading days, badges and sharing (the Progress tab). */
export function ReadingStats() {
  const t = useTheme();
  const { t: tr, tn } = useT();
  const tablet = useIsTablet();
  const wide = useWindowDimensions().width >= 1100;
  const stats = useLive((db) => getReadingStats(db), [], ['reads']);
  const counts = useLive((db) => getAllReadCounts(db), [], ['reads']);
  const badges = useLive((db) => getBadges(db), [], ['reads', 'highlights', 'notes', 'topics', 'bookmarks', 'plans']);
  const earnedCount = badges?.filter((b) => b.earned).length ?? 0;

  const distinct = counts ? counts.size : 0;
  const pct = distinct / TOTAL_CHAPTERS;
  const completions = counts && counts.size === TOTAL_CHAPTERS ? Math.min(...counts.values()) : 0;

  const tiles = [
    { icon: 'flame' as const, value: stats?.streak ?? 0, label: tr('today.streak'), accent: true },
    { icon: 'shield-checkmark-outline' as const, value: stats?.graceDays ?? 0, label: tr('today.graceDays') },
    { icon: 'book-outline' as const, value: stats?.todayReads ?? 0, label: tr('today.chaptersToday') },
    { icon: 'trophy-outline' as const, value: stats?.bestStreak ?? 0, label: tr('today.bestStreak') },
  ];

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((s) => (
          <Card key={s.label} style={{ flexGrow: 1, flexBasis: tablet ? '22%' : '45%', gap: 2 }}>
            <Ionicons name={s.icon} size={20} color={s.accent ? t.accent : t.text} />
            <Txt variant="title" style={{ fontSize: 28, marginTop: 4 }}>
              {s.value}
            </Txt>
            <Txt variant="small" muted>
              {s.label}
            </Txt>
          </Card>
        ))}
      </View>
      <Txt variant="caption" muted style={{ marginTop: 8 }}>
        {tr('today.graceExplain', { n: GRACE_EVERY })}
      </Txt>

      <SectionTitle>{tr('common.wholeBible')}</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">{tr('today.chaptersOf', { done: distinct, total: TOTAL_CHAPTERS })}</Txt>
          <Txt variant="label" color={t.accent}>
            {(pct * 100).toFixed(1)}%
          </Txt>
        </Row>
        <ProgressBar value={pct} height={8} />
        <Txt variant="small" muted>
          {completions > 0
            ? tn('today.bibleCompleted', completions)
            : tr('today.otNt', { ot: countIn(counts, 'OT'), nt: countIn(counts, 'NT') })}
        </Txt>
      </Card>

      <SectionTitle>{tr('today.readingDays')}</SectionTitle>
      <Card>
        <ReadingHeatmap days={stats?.days ?? new Map()} grace={stats?.graceUsed} weeks={tablet && !wide ? 30 : 18} />
      </Card>

      <View style={{ gap: 8, marginTop: 14 }}>
        <Row>
          <Button kind="secondary" icon="ribbon-outline" title={`${tr('today.badges')} · ${earnedCount}`} onPress={() => router.push('/badges')} style={{ flex: 1 }} />
          <Button kind="secondary" icon="share-social-outline" title={tr('today.shareResults')} onPress={() => router.push('/results')} style={{ flex: 1 }} />
        </Row>
      </View>
    </View>
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
