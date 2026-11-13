import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReadingHeatmap } from '@/components/heatmap';
import { ImportButton } from '@/components/import-button';
import { Button, Card, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt, useIsTablet } from '@/components/ui';
import { BOOKS, TOTAL_CHAPTERS, bookName, getBook } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { getBadges } from '@/lib/badges';
import { GRACE_EVERY, getAllReadCounts, getReadingStats } from '@/lib/data';
import { dayLabel, openChapter } from '@/lib/plan-format';
import { getActivePlanProgress } from '@/lib/plans';
import { useSettings } from '@/lib/settings';
import { getVotd } from '@/lib/votd';

function greeting(es: boolean) {
  const h = new Date().getHours();
  if (es) return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening';
}

export default function TodayScreen() {
  const t = useTheme();
  const tablet = useIsTablet();
  const settings = useSettings();
  const { list, current, lang } = useTranslations();
  const es = lang === 'es';
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
    { icon: 'flame' as const, value: stats?.streak ?? 0, label: es ? 'Racha (días)' : 'Day streak' },
    { icon: 'shield-checkmark' as const, value: stats?.graceDays ?? 0, label: es ? 'Días de gracia' : 'Grace days' },
    { icon: 'today' as const, value: stats?.todayReads ?? 0, label: es ? 'Capítulos hoy' : 'Chapters today' },
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

      {/* New badge */}
      {newBadges.length > 0 && (
        <Card style={{ marginTop: 18, backgroundColor: t.accentSoft, borderColor: t.accent }} onPress={() => router.push('/badges')}>
          <Row gap={12}>
            <View style={[styles.medal, { backgroundColor: t.accent }]}>
              <Ionicons name={newBadges[0].icon} size={24} color={t.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={t.accent} style={{ fontWeight: '700' }}>
                {es ? '¡NUEVA INSIGNIA!' : 'NEW BADGE!'}
                {newBadges.length > 1 ? ` +${newBadges.length - 1}` : ''}
              </Txt>
              <Txt variant="heading">{es ? newBadges[0].es : newBadges[0].en}</Txt>
              <Txt variant="small" muted>
                {es ? newBadges[0].descEs : newBadges[0].descEn}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.accent} />
          </Row>
        </Card>
      )}

      {/* Verse of the day */}
      {votd && votd.text ? (
        <Card style={{ marginTop: 18, gap: 8 }} onPress={() => openChapter(votd.book, votd.ch)}>
          <Txt variant="caption" muted style={{ fontWeight: '700' }}>
            {es ? 'VERSÍCULO DEL DÍA' : 'VERSE OF THE DAY'}
          </Txt>
          <Txt variant="serif" style={{ fontSize: 19, lineHeight: 29 }}>
            “{votd.text}”
          </Txt>
          <Txt variant="label" color={t.accent}>
            {votd.label} · {current?.abbr}
          </Txt>
        </Card>
      ) : null}

      {/* Today's reading */}
      {plan && planDay ? (
        <Card style={{ marginTop: 12, gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" muted style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {(es ? 'PLAN: ' : 'PLAN: ') + plan.plan.name.toUpperCase()}
            </Txt>
            <Pressable onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.plan.id } })}>
              <Txt variant="small" color={t.accent} style={{ fontWeight: '700' }}>
                {es ? 'Ver plan' : 'View plan'}
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
                style={({ pressed }) => [styles.pill, { backgroundColor: c.done ? t.accent : t.cardAlt, opacity: pressed ? 0.7 : 1 }]}>
                {c.done && <Ionicons name="checkmark" size={14} color={t.onAccent} />}
                <Txt variant="small" color={c.done ? t.onAccent : t.text} style={{ fontWeight: '600' }}>
                  {bookName(c.book, lang)} {c.ch}
                </Txt>
              </Pressable>
            ))}
          </Row>
          <ProgressBar value={plan.doneChapters / plan.totalChapters} />
          <Txt variant="small" muted>
            {es ? 'Día' : 'Day'} {planDay.index + 1}/{plan.plan.days} ·{' '}
            {plan.behind > 0 ? (es ? `${plan.behind} capítulos atrasado` : `${plan.behind} chapters behind`) : es ? 'al día ✓' : 'on track ✓'}
          </Txt>
        </Card>
      ) : (
        <Card style={{ marginTop: 12, gap: 10 }} onPress={() => openChapter(nextUp.book, nextUp.ch)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" muted style={{ textTransform: 'uppercase', fontWeight: '700' }}>
                {stats?.lastRead ? (es ? 'Sigue leyendo' : 'Up next') : es ? 'Empieza aquí' : 'Start here'}
              </Txt>
              <Txt variant="title" style={{ fontSize: 24 }}>
                {bookName(nextUp.book, lang)} {nextUp.ch}
              </Txt>
            </View>
            <Ionicons name="arrow-forward-circle" size={40} color={t.accent} />
          </Row>
          <Button kind="secondary" small icon="calendar-outline" title={es ? 'Empezar un plan de lectura' : 'Start a reading plan'} onPress={() => router.push('/plans')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}

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
      <Txt variant="caption" muted style={{ marginTop: 8 }}>
        {es
          ? `Ganas un día de gracia por cada ${GRACE_EVERY} días de lectura (máx. 2). Si un día no lees, tu racha no se pierde.`
          : `You earn a grace day for every ${GRACE_EVERY} reading days (max 2). Miss a day and your streak is kept.`}
      </Txt>

      <Row style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <Button kind="secondary" small icon="calendar" title={es ? 'Planes' : 'Plans'} onPress={() => router.push('/plans')} />
        <Button kind="secondary" small icon="ribbon" title={`${es ? 'Insignias' : 'Badges'} · ${earnedCount}`} onPress={() => router.push('/badges')} />
      </Row>

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
        <Button
          kind="secondary"
          small
          title={es ? 'Ver progreso por libro' : 'See progress by book'}
          onPress={() => router.navigate('/progress')}
          style={{ alignSelf: 'flex-start' }}
        />
      </Card>

      <SectionTitle>{es ? 'Días de lectura' : 'Reading days'}</SectionTitle>
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});
