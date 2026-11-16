import { router } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { SyncBadge } from '@/components/sync-badge';
import { Button, Card, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { getBook, refLabel } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT, type TKey } from '@/i18n';
import { getBadges } from '@/lib/badges';
import { getReadingStats } from '@/lib/data';
import { useHub } from '@/lib/hub';
import { dayLabel, openChapter } from '@/lib/plan-format';
import { getActivePlanProgress } from '@/lib/plans';
import { useSettings } from '@/lib/settings';
import { localDay } from '@/lib/db';
import { challengeTarget, listChallenges, myMemberships } from '@/lib/social';
import { getVotd } from '@/lib/votd';

/**
 * Today: verse of the day, where you left off, then your reading plans and challenges (only if you have any).
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

  // Where the reader is now (the last chapter opened, and the verse you'd scrolled to).
  const resume = { book: settings.book, ch: settings.chapter, v: settings.verse };
  const resumeLabel = refLabel(resume.book, resume.ch, resume.v ?? undefined, lang);
  // Next chapter after the last one actually read (history marks from Progress don't count).
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
  // Just finished the chapter the reader is on: offer the following one instead of the same one again.
  const continueNext = !!stats?.lastRead && stats.lastRead.book === resume.book && stats.lastRead.ch === resume.ch;

  // Challenges you're in right now (the full list is in Yo → Amigos y retos).
  const challenges = useRemote(async () => {
    if (!hub) return [];
    const today = localDay();
    const [list, mine] = await Promise.all([listChallenges(), myMemberships()]);
    return list
      .filter((x) => x.start_day <= today && x.end_day >= today && mine.some((m) => m.challenge === x.id))
      .map((c) => {
        const me = mine.find((m) => m.challenge === c.id)!;
        const daysLeft = Math.max(0, Math.round((new Date(`${c.end_day}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000));
        return { id: c.id, title: c.title, progress: me.progress, target: challengeTarget(c), done: me.done, daysLeft };
      });
  }, [hub?.user.id ?? '']).data;
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

      {/* 1. Verse of the day */}
      {votd && votd.text ? (
        <View style={[styles.votd, { marginTop: 18, backgroundColor: t.ink }]}>
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


      {/* 2. Where you left off. */}
      {!noBibles && (
        <Card style={{ marginTop: 12, gap: 12 }}>
          <Txt variant="caption" muted style={styles.kicker}>
            {continueNext ? tr('today.upNext') : tr('today.continue')}
          </Txt>
          <View>
            <Txt variant="title" style={{ fontSize: 26 }}>
              {continueNext ? refLabel(nextUp.book, nextUp.ch, undefined, lang) : resumeLabel}
            </Txt>
            {current && (
              <Txt variant="small" muted>
                {current.abbr}
              </Txt>
            )}
          </View>
          <Button
            icon="book-outline"
            title={continueNext ? tr('today.readButton', { ref: refLabel(nextUp.book, nextUp.ch, undefined, lang) }) : tr('today.continue')}
            onPress={() => (continueNext ? openChapter(nextUp.book, nextUp.ch) : router.navigate('/read'))}
          />
        </Card>
      )}

      {/* 3. Your reading plans (only when you have one). */}
      {!noBibles && !!plans?.length && (
        <>
          <SectionTitle>{tn('today.myPlans', plans.length)}</SectionTitle>
          <View style={{ gap: 10 }}>
            {plans.map((p) => {
              const day = p.nextDay;
              if (!day) return null;
              const next = day.chapters.find((c) => !c.done) ?? null;
              // Today's part is done and the next day is in the future.
              const ahead = p.todayIndex >= 0 && day.index > p.todayIndex;
              return (
                <Card key={p.plan.id} style={{ gap: 10 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt variant="caption" muted style={[styles.kicker, { flex: 1 }]} numberOfLines={1}>
                      {ahead ? `${tr('today.planDoneToday')} ✓ · ` : ''}
                      {p.plan.name}
                    </Txt>
                    <Pressable onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.plan.id } })} hitSlop={8}>
                      <Txt variant="small" style={{ fontWeight: '700' }}>
                        {tr('today.viewPlan')}
                      </Txt>
                    </Pressable>
                  </Row>
                  <Txt variant="heading">{dayLabel(day, lang)}</Txt>
                  {next && (
                    <Button
                      small
                      kind={ahead ? 'secondary' : 'primary'}
                      icon="book-outline"
                      title={tr(ahead ? 'today.readAhead' : 'today.readButton', { ref: refLabel(next.book, next.ch, undefined, lang) })}
                      onPress={() => openChapter(next.book, next.ch)}
                      style={{ alignSelf: 'flex-start' }}
                    />
                  )}
                  <ProgressBar value={p.doneChapters / p.totalChapters} height={6} />
                  <Txt variant="small" muted>
                    {tr('today.dayOf', { day: day.index + 1, total: p.plan.days })} ·{' '}
                    {p.behind > 0 ? tn('today.behind', p.behind) : `${tr('today.onTrack')} ✓`}
                  </Txt>
                </Card>
              );
            })}
          </View>
        </>
      )}

      {/* 4. Challenges with other members (only when you're in one). */}
      {!!challenges?.length && (
        <>
          <SectionTitle>{tr('today.challenges')}</SectionTitle>
          <View style={{ gap: 10 }}>
            {challenges.map((c) => (
              <Card key={c.id} style={{ gap: 8 }} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>
                    {c.title}
                  </Txt>
                  <Txt variant="small" muted>
                    {tn('friends.daysLeft', c.daysLeft)}
                  </Txt>
                </Row>
                <ProgressBar value={c.target ? c.progress / c.target : 0} height={6} color={c.done ? t.success : t.accent} />
                <Txt variant="small">
                  {tr('friends.you', { p: c.progress, t: c.target })}
                  {c.done ? ` · ${tr('friends.done')}` : ''}
                </Txt>
              </Card>
            ))}
          </View>
        </>
      )}

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
  inkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, marginTop: 12 },
});
