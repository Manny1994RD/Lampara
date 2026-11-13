import { router } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { SyncBadge } from '@/components/sync-badge';
import { Button, Card, Ionicons, ProgressBar, Row, Screen, Txt } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { bookName, getBook, refLabel } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT, type TKey } from '@/i18n';
import { getBadges } from '@/lib/badges';
import { getReadingStats } from '@/lib/data';
import { useHub } from '@/lib/hub';
import { dayLabel, openChapter } from '@/lib/plan-format';
import { getActivePlanProgress } from '@/lib/plans';
import { useSettings } from '@/lib/settings';
import { getVotd } from '@/lib/votd';

/**
 * Today: one clear path into reading.
 * Greeting → continue where you stopped → today's reading → verse of the day.
 * Streaks, badges and statistics live in Progress.
 */
export default function TodayScreen() {
  const t = useTheme();
  const { t: tr, tn, date } = useT();
  const settings = useSettings();
  const hub = useHub();
  const { list, current, lang } = useTranslations();
  const stats = useLive((db) => getReadingStats(db), [], ['reads']);
  const plans = useLive((db) => getActivePlanProgress(db), [], ['plans', 'reads']);
  const votd = useLive((db) => getVotd(db, current?.id ?? null, lang), [current?.id, lang], ['translations']);
  const badges = useLive((db) => getBadges(db), [], ['reads', 'highlights', 'notes', 'topics', 'bookmarks', 'plans']);

  const seen = new Set(settings.seenBadges);
  const newBadges = badges?.filter((b) => b.earned && !seen.has(b.id)) ?? [];

  const hour = new Date().getHours();
  const greeting = tr(hour < 12 ? 'greet.morning' : hour < 19 ? 'greet.afternoon' : 'greet.evening');
  const firstName = hub?.user.name?.trim().split(/\s+/)[0];

  // Where the reader is now (the last chapter opened).
  const resume = { book: settings.book, ch: settings.chapter };
  // Next chapter after the last one marked read (used when there's no active plan).
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
  const sameAsResume = nextUp.book === resume.book && nextUp.ch === resume.ch;

  const plan = plans?.[0];
  const planDay = plan?.nextDay;
  const noBibles = list && list.length === 0;

  const shareVerse = () => {
    if (!votd?.text) return;
    const message = `${votd.text}\n— ${votd.label}${current ? ` (${current.abbr})` : ''}`;
    if (Platform.OS === 'web') {
      if (navigator.share) navigator.share({ text: message }).catch(() => undefined);
      else navigator.clipboard?.writeText(message);
    } else Share.share({ message });
  };

  return (
    <Screen maxWidth={720}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Txt muted variant="small">
            {capitalize(date(new Date(), { weekday: 'long', month: 'long', day: 'numeric' }))}
          </Txt>
          <Txt variant="title" style={{ marginTop: 2, fontSize: 30 }}>
            {firstName ? `${greeting}, ${firstName}` : greeting}
          </Txt>
        </View>
        <SyncBadge style={{ marginTop: 4 }} />
      </Row>

      {noBibles && (
        <Card style={{ marginTop: 18, gap: 12 }}>
          <Row>
            <Ionicons name="book" size={22} color={t.accent} />
            <Txt variant="heading">{tr('today.chooseBible')}</Txt>
          </Row>
          <Txt muted>{hub ? tr('today.chooseBibleHub') : tr('today.chooseBibleLocal')}</Txt>
          <Button
            icon="arrow-forward"
            title={tr('today.chooseBibleButton')}
            onPress={() => router.push({ pathname: '/welcome', params: { step: hub ? 'bible' : 'account' } })}
          />
        </Card>
      )}

      {/* 1. Continue reading */}
      {!noBibles && (
        <Card style={{ marginTop: 18, gap: 6 }} onPress={() => router.navigate('/read')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" muted style={styles.kicker}>
                {tr('today.continue')}
              </Txt>
              <Txt variant="title" style={{ fontSize: 26 }}>
                {refLabel(resume.book, resume.ch, undefined, lang)}
              </Txt>
              {current && (
                <Txt variant="small" muted>
                  {current.abbr}
                </Txt>
              )}
            </View>
            <View style={[styles.roundGo, { backgroundColor: t.ink }]}>
              <Ionicons name="play" size={22} color={t.onInk} style={{ marginLeft: 3 }} />
            </View>
          </Row>
        </Card>
      )}

      {/* 2. Today's reading */}
      {!noBibles &&
        (plan && planDay ? (
          <Card style={{ marginTop: 12, gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="caption" muted style={[styles.kicker, { flex: 1 }]} numberOfLines={1}>
                {tr('today.todaysReading')} · {plan.plan.name}
              </Txt>
              <Pressable onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.plan.id } })} hitSlop={8}>
                <Txt variant="small" style={{ fontWeight: '700' }}>
                  {tr('today.viewPlan')}
                </Txt>
              </Pressable>
            </Row>
            <Txt variant="title" style={{ fontSize: 22 }}>
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
          <Card style={{ marginTop: 12, gap: 10 }}>
            <Txt variant="caption" muted style={styles.kicker}>
              {tr('today.todaysReading')}
            </Txt>
            {!sameAsResume && (
              <Pressable onPress={() => openChapter(nextUp.book, nextUp.ch)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="heading">
                    {tr('today.upNext')}: {refLabel(nextUp.book, nextUp.ch, undefined, lang)}
                  </Txt>
                  <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
                </Row>
              </Pressable>
            )}
            <Txt variant="small" muted>
              {tr('today.noPlanHint')}
            </Txt>
            <Button kind="secondary" small icon="calendar-outline" title={tr('today.startPlan')} onPress={() => router.push('/plans')} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ))}

      {/* 3. Verse of the day */}
      {votd && votd.text ? (
        <View style={[styles.votd, { backgroundColor: t.ink }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" color={t.onInk} style={[styles.kicker, { opacity: 0.7 }]}>
              {tr('today.votd')}
            </Txt>
            <Ionicons name="flame" size={18} color={t.accent} />
          </Row>
          <Text style={[styles.votdText, { color: t.onInk, fontFamily: Fonts.serif }]}>{votd.text}</Text>
          <Txt variant="label" color={t.onInk} style={{ opacity: 0.85 }}>
            {votd.label}
            {current ? ` · ${current.abbr}` : ''}
          </Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Pressable onPress={() => openChapter(votd.book, votd.ch)} style={({ pressed }) => [styles.inkButton, { borderColor: t.onInk, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="book-outline" size={16} color={t.onInk} />
              <Txt variant="small" color={t.onInk} style={{ fontWeight: '700' }}>
                {tr('today.readInContext')}
              </Txt>
            </Pressable>
            <Pressable onPress={shareVerse} style={({ pressed }) => [styles.inkButton, { borderColor: t.onInk, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="share-outline" size={16} color={t.onInk} />
              <Txt variant="small" color={t.onInk} style={{ fontWeight: '700' }}>
                {tr('common.share')}
              </Txt>
            </Pressable>
          </Row>
        </View>
      ) : null}

      {/* A quiet line about progress; the details are in Progress. */}
      {!noBibles && (
        <Pressable onPress={() => router.navigate('/progress')} style={({ pressed }) => [styles.progressLine, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="flame" size={18} color={t.accent} />
          <Txt variant="small" style={{ flex: 1 }}>
            {tn('today.streakLine', stats?.streak ?? 0)} · {tn('today.todayLine', stats?.todayReads ?? 0)}
          </Txt>
          {newBadges.length > 0 && (
            <Txt variant="caption" color={t.accent} style={{ fontWeight: '800' }}>
              {tr('today.newBadge')}
            </Txt>
          )}
          <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
        </Pressable>
      )}
      {newBadges.length > 0 && (
        <Txt variant="caption" muted style={{ marginTop: 6 }}>
          {tr(`badge.${newBadges[0].id}` as TKey)}
        </Txt>
      )}
    </Screen>
  );
}

/** Only the first letter ("viernes, 13 de noviembre" → "Viernes, 13 de noviembre"). */
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  kicker: { textTransform: 'uppercase', fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  votd: { marginTop: 12, borderRadius: 22, padding: 20, gap: 14 },
  votdText: { fontSize: 21, lineHeight: 32 },
  roundGo: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  inkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, marginTop: 12 },
});
