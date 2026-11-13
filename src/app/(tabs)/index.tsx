import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReadingHeatmap } from '@/components/heatmap';
import { ImportButton } from '@/components/import-button';
import { Button, Card, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt, useIsTablet } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { BOOKS, TOTAL_CHAPTERS, bookName, getBook, refLabel } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT, type TKey } from '@/i18n';
import { getBadges } from '@/lib/badges';
import { GRACE_EVERY, getAllReadCounts, getReadingStats } from '@/lib/data';
import { dayLabel, openChapter } from '@/lib/plan-format';
import { getActivePlanProgress } from '@/lib/plans';
import { useSettings } from '@/lib/settings';
import { getVotd } from '@/lib/votd';

export default function TodayScreen() {
  const t = useTheme();
  const { t: tr, tn, date } = useT();
  const tablet = useIsTablet();
  const settings = useSettings();
  const { list, current, lang } = useTranslations();
  const stats = useLive((db) => getReadingStats(db), [], ['reads']);
  const counts = useLive((db) => getAllReadCounts(db), [], ['reads']);
  const plans = useLive((db) => getActivePlanProgress(db), [], ['plans', 'reads']);
  const votd = useLive((db) => getVotd(db, current?.id ?? null, lang), [current?.id, lang], ['translations']);
  const badges = useLive((db) => getBadges(db), [], ['reads', 'highlights', 'notes', 'topics', 'bookmarks', 'plans']);

  const seen = new Set(settings.seenBadges);
  const newBadges = badges?.filter((b) => b.earned && !seen.has(b.id)) ?? [];
  const earnedCount = badges?.filter((b) => b.earned).length ?? 0;

  const distinct = counts ? counts.size : 0;
  const pct = distinct / TOTAL_CHAPTERS;
  const completions = counts && counts.size === TOTAL_CHAPTERS ? Math.min(...counts.values()) : 0;

  const hour = new Date().getHours();
  const greeting = tr(hour < 12 ? 'greet.morning' : hour < 19 ? 'greet.afternoon' : 'greet.evening');

  // Next chapter after the last one read (used when there's no active plan).
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

  const plan = plans?.[0];
  const planDay = plan?.nextDay;

  const statTiles = [
    { icon: 'flame' as const, value: stats?.streak ?? 0, label: tr('today.streak'), accent: true },
    { icon: 'shield-checkmark-outline' as const, value: stats?.graceDays ?? 0, label: tr('today.graceDays') },
    { icon: 'book-outline' as const, value: stats?.todayReads ?? 0, label: tr('today.chaptersToday') },
    { icon: 'trophy-outline' as const, value: stats?.bestStreak ?? 0, label: tr('today.bestStreak') },
  ];

  return (
    <Screen>
      <Txt muted variant="small" style={{ textTransform: 'capitalize' }}>
        {date(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}
      </Txt>
      <Txt variant="title" style={{ marginTop: 2, fontSize: 32 }}>
        {greeting}
      </Txt>

      {list && list.length === 0 && (
        <Card style={{ marginTop: 18, gap: 12 }}>
          <Row>
            <Ionicons name="flame" size={22} color={t.accent} />
            <Txt variant="heading">{tr('welcome.title')}</Txt>
          </Row>
          <Txt muted>{tr('welcome.body')}</Txt>
          <ImportButton />
        </Card>
      )}

      {/* New badge */}
      {newBadges.length > 0 && (
        <Card style={{ marginTop: 18, backgroundColor: t.accentSoft }} onPress={() => router.push('/badges')}>
          <Row gap={12}>
            <View style={[styles.medal, { backgroundColor: t.accent }]}>
              <Ionicons name={newBadges[0].icon} size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={t.accent} style={{ fontWeight: '800' }}>
                {tr('today.newBadge')}
                {newBadges.length > 1 ? ` +${newBadges.length - 1}` : ''}
              </Txt>
              <Txt variant="heading">{tr(`badge.${newBadges[0].id}` as TKey)}</Txt>
              <Txt variant="small" muted>
                {tr(`badge.${newBadges[0].id}.desc` as TKey)}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
          </Row>
        </Card>
      )}

      {/* Verse of the day */}
      {votd && votd.text ? (
        <Pressable onPress={() => openChapter(votd.book, votd.ch)} style={({ pressed }) => [styles.votd, { backgroundColor: t.ink, opacity: pressed ? 0.9 : 1 }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" color={t.onInk} style={{ fontWeight: '800', opacity: 0.7, textTransform: 'uppercase' }}>
              {tr('today.votd')}
            </Txt>
            <Ionicons name="flame" size={18} color={t.accent} />
          </Row>
          <Text style={[styles.votdText, { color: t.onInk, fontFamily: Fonts.serif }]}>{votd.text}</Text>
          <Txt variant="label" color={t.onInk} style={{ opacity: 0.85 }}>
            {votd.label} · {current?.abbr}
          </Txt>
        </Pressable>
      ) : null}

      {/* Today's reading */}
      {plan && planDay ? (
        <Card style={{ marginTop: 12, gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" muted style={{ fontWeight: '700', flex: 1, textTransform: 'uppercase' }} numberOfLines={1}>
              {tr('today.plan')} · {plan.plan.name}
            </Txt>
            <Pressable onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.plan.id } })} hitSlop={8}>
              <Txt variant="small" style={{ fontWeight: '700' }}>
                {tr('today.viewPlan')}
              </Txt>
            </Pressable>
          </Row>
          <Txt variant="title" style={{ fontSize: 24 }}>
            {dayLabel(planDay, lang)}
          </Txt>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            {planDay.chapters.map((c) => (
              <Pressable
                key={`${c.book}:${c.ch}`}
                onPress={() => openChapter(c.book, c.ch)}
                style={({ pressed }) => [styles.pill, { backgroundColor: c.done ? t.ink : t.background, opacity: pressed ? 0.7 : 1 }]}>
                {c.done && <Ionicons name="checkmark" size={14} color={t.onInk} />}
                <Txt variant="small" color={c.done ? t.onInk : t.text} style={{ fontWeight: '600' }}>
                  {bookName(c.book, lang)} {c.ch}
                </Txt>
              </Pressable>
            ))}
          </Row>
          <ProgressBar value={plan.doneChapters / plan.totalChapters} height={6} />
          <Txt variant="small" muted>
            {tr('today.dayOf', { day: planDay.index + 1, total: plan.plan.days })} ·{' '}
            {plan.behind > 0 ? tn('today.behind', plan.behind) : `${tr('today.onTrack')} ✓`}
          </Txt>
        </Card>
      ) : (
        <Card style={{ marginTop: 12, gap: 12 }} onPress={() => openChapter(nextUp.book, nextUp.ch)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" muted style={{ textTransform: 'uppercase', fontWeight: '700' }}>
                {stats?.lastRead ? tr('today.upNext') : tr('today.startHere')}
              </Txt>
              <Txt variant="title" style={{ fontSize: 26 }}>
                {refLabel(nextUp.book, nextUp.ch, undefined, lang)}
              </Txt>
            </View>
            <View style={[styles.roundGo, { backgroundColor: t.ink }]}>
              <Ionicons name="arrow-forward" size={22} color={t.onInk} />
            </View>
          </Row>
          <Button kind="secondary" small icon="calendar-outline" title={tr('today.startPlan')} onPress={() => router.push('/plans')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}

      {/* Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {statTiles.map((s) => (
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

      <View style={{ gap: 8, marginTop: 14 }}>
        <Button icon="share-social-outline" title={tr('today.shareResults')} onPress={() => router.push('/results')} />
        <Row>
          <Button kind="secondary" icon="calendar-outline" title={tr('today.plans')} onPress={() => router.push('/plans')} style={{ flex: 1 }} />
          <Button kind="secondary" icon="ribbon-outline" title={`${tr('today.badges')} · ${earnedCount}`} onPress={() => router.push('/badges')} style={{ flex: 1 }} />
        </Row>
      </View>

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
        <Button kind="ghost" small icon="chevron-forward" title={tr('today.byBook')} onPress={() => router.navigate('/progress')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </Card>

      <SectionTitle>{tr('today.readingDays')}</SectionTitle>
      <Card>
        <ReadingHeatmap days={stats?.days ?? new Map()} grace={stats?.graceUsed} weeks={tablet ? 30 : 18} />
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

const styles = StyleSheet.create({
  medal: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  votd: { marginTop: 18, borderRadius: 22, padding: 20, gap: 14 },
  votdText: { fontSize: 21, lineHeight: 32 },
  roundGo: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
