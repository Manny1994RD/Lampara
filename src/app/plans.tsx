import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, IconButton, ProgressBar, Row, Screen, SectionTitle, Sheet, Txt } from '@/components/ui';
import { BOOKS, bookAbbr, bookName } from '@/data/books';
import { PLAN_KINDS, planChapters, type PlanKind } from '@/data/plans';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT, type TKey } from '@/i18n';
import { localDay } from '@/lib/db';
import { createPlan, getPlanProgress, getPlans } from '@/lib/plans';

const DAY_PRESETS = [30, 60, 90, 180, 365];

export default function PlansScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { lang } = useTranslations();
  const { t: tr, tn, date } = useT();
  const plans = useLive(
    async (d) => Promise.all((await getPlans(d)).map((p) => getPlanProgress(d, p))),
    [],
    ['plans', 'reads']
  );

  const [draft, setDraft] = useState<{ kind: PlanKind; name: string; days: string; books: number[]; start: 'today' | 'tomorrow'; finishBy: string } | null>(null);

  const open = (kind: PlanKind) => {
    const preset = PLAN_KINDS.find((p) => p.kind === kind);
    setDraft({
      kind,
      name: preset ? tr(`plans.kind.${preset.kind}` as TKey) : tr('plans.myPlan'),
      days: String(preset?.days ?? 30),
      books: [],
      start: 'today',
      finishBy: '',
    });
  };

  const startDay = (s: 'today' | 'tomorrow') => {
    const d = new Date();
    if (s === 'tomorrow') d.setDate(d.getDate() + 1);
    return localDay(d);
  };

  const chapterCount = draft ? planChapters(draft.kind, draft.books).length : 0;
  const daysNum = Math.max(1, parseInt(draft?.days || '0', 10) || 0);

  const setFinishBy = (value: string) => {
    if (!draft) return;
    const next = { ...draft, finishBy: value };
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const diff = Math.round((new Date(`${value}T12:00:00`).getTime() - new Date(`${startDay(draft.start)}T12:00:00`).getTime()) / 86400000) + 1;
      if (diff > 0) next.days = String(diff);
    }
    setDraft(next);
  };

  const save = async () => {
    if (!draft || chapterCount === 0) return;
    const id = await createPlan(db, { name: draft.name, kind: draft.kind, books: draft.books, days: daysNum, startDay: startDay(draft.start) });
    setDraft(null);
    router.replace({ pathname: '/plan/[id]', params: { id } });
  };

  const active = plans?.filter((p) => p.plan.status === 'active') ?? [];
  const finished = plans?.filter((p) => p.plan.status === 'done') ?? [];

  return (
    <Screen>
      <Row>
        <IconButton icon="chevron-back" label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          {tr('plans.title')}
        </Txt>
      </Row>

      {active.length > 0 && <SectionTitle>{tr('plans.active')}</SectionTitle>}
      <View style={{ gap: 10 }}>
        {active.map((p) => (
          <Card key={p.plan.id} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.plan.id } })} style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="label" style={{ flex: 1 }}>
                {p.plan.name}
              </Txt>
              <Txt variant="small" muted>
                {tr('plan.dayOf', { day: Math.min(p.plan.days, Math.max(1, p.todayIndex + 1)), total: p.plan.days })}
              </Txt>
            </Row>
            <ProgressBar value={p.doneChapters / p.totalChapters} />
            <Txt variant="small" color={p.behind > 0 ? t.danger : t.success}>
              {p.behind > 0 ? tn('today.behind', p.behind) : `${tr('today.onTrack')} ✓`}
            </Txt>
          </Card>
        ))}
      </View>

      <SectionTitle>{tr('plans.start')}</SectionTitle>
      <View style={styles.grid}>
        {PLAN_KINDS.map((k) => (
          <Card key={k.kind} onPress={() => open(k.kind)} style={styles.tile}>
            <Txt variant="label">{tr(`plans.kind.${k.kind}` as TKey)}</Txt>
            <Txt variant="small" muted>
              {tr(`plans.kind.${k.kind}.desc` as TKey)}
            </Txt>
            <Txt variant="caption" color={t.accent}>
              {tn('common.chapters', planChapters(k.kind).length)} · {tn('common.days', k.days)}
            </Txt>
          </Card>
        ))}
        <Card onPress={() => open('custom')} style={styles.tile}>
          <Txt variant="label">{tr('plans.custom')}</Txt>
          <Txt variant="small" muted>
            {tr('plans.customDesc')}
          </Txt>
        </Card>
      </View>

      {finished.length > 0 && (
        <>
          <SectionTitle>{tr('plans.completed')}</SectionTitle>
          {finished.map((p) => (
            <Card key={p.plan.id} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.plan.id } })} style={{ marginBottom: 8 }}>
              <Txt variant="label">🏁 {p.plan.name}</Txt>
              {p.plan.completed_at && (
                <Txt variant="small" muted>
                  {date(p.plan.completed_at)}
                </Txt>
              )}
            </Card>
          ))}
        </>
      )}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={tr('plans.new')}>
        {draft && (
          <View style={{ gap: 12 }}>
            <Txt variant="label">{tr('plans.name')}</Txt>
            <TextInput value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]} />

            {draft.kind === 'custom' && (
              <>
                <Txt variant="label">{tr('picker.books')}</Txt>
                <View style={styles.bookWrap}>
                  {BOOKS.map((b) => {
                    const on = draft.books.includes(b.n);
                    return (
                      <Pressable
                        key={b.n}
                        onPress={() => setDraft({ ...draft, books: on ? draft.books.filter((x) => x !== b.n) : [...draft.books, b.n].sort((a, c) => a - c) })}
                        style={[styles.bookChip, { backgroundColor: on ? t.accent : t.cardAlt }]}>
                        <Txt variant="caption" color={on ? t.onAccent : t.text} style={{ fontWeight: '600' }}>
                          {bookAbbr(b.n, lang)}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
                {draft.books.length > 0 && (
                  <Txt variant="small" muted numberOfLines={2}>
                    {draft.books.map((n) => bookName(n, lang)).join(', ')}
                  </Txt>
                )}
              </>
            )}

            <Txt variant="label">{tr('plans.startWhen')}</Txt>
            <Row>
              <Chip label={tr('tab.today')} selected={draft.start === 'today'} onPress={() => setDraft({ ...draft, start: 'today' })} />
              <Chip label={tr('common.tomorrow')} selected={draft.start === 'tomorrow'} onPress={() => setDraft({ ...draft, start: 'tomorrow' })} />
            </Row>

            <Txt variant="label">{tr('plans.length')}</Txt>
            <Row style={{ flexWrap: 'wrap' }}>
              {DAY_PRESETS.map((d) => (
                <Chip key={d} label={`${d}`} selected={daysNum === d} onPress={() => setDraft({ ...draft, days: String(d), finishBy: '' })} />
              ))}
              <TextInput
                value={draft.days}
                onChangeText={(days) => setDraft({ ...draft, days: days.replace(/\D/g, ''), finishBy: '' })}
                keyboardType="number-pad"
                style={[styles.input, { width: 80, color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
              />
            </Row>
            <Txt variant="small" muted>
              {tr('plans.finishBy')}
            </Txt>
            <TextInput
              value={draft.finishBy}
              onChangeText={setFinishBy}
              placeholder="2027-04-05"
              placeholderTextColor={t.textSecondary}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
            />

            <Card style={{ backgroundColor: t.accentSoft, borderColor: t.accentSoft }}>
              <Txt variant="label">
                {tn('common.chapters', chapterCount)} · {tn('common.days', daysNum)}
              </Txt>
              <Txt variant="small" muted>
                {chapterCount
                  ? tr('plans.perDay', { n: (chapterCount / daysNum).toFixed(1) })
                  : tr('plans.pickBook')}
              </Txt>
            </Card>
            <Button title={tr('plans.startPlan')} icon="play" disabled={!chapterCount || !draft.name.trim()} onPress={save} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '45%', flexGrow: 1, gap: 4, minHeight: 110 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16 },
  bookWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  bookChip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, minWidth: 40, alignItems: 'center' },
});
