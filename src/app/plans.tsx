import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, IconButton, ProgressBar, Row, Screen, SectionTitle, Sheet, Txt } from '@/components/ui';
import { BOOKS, bookName } from '@/data/books';
import { PLAN_KINDS, planChapters, type PlanKind } from '@/data/plans';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { localDay } from '@/lib/db';
import { createPlan, getPlanProgress, getPlans } from '@/lib/plans';

const DAY_PRESETS = [30, 60, 90, 180, 365];

export default function PlansScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { lang } = useTranslations();
  const es = lang === 'es';
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
      name: preset ? (es ? preset.es : preset.en) : es ? 'Mi plan' : 'My plan',
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
        <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          {es ? 'Planes de lectura' : 'Reading plans'}
        </Txt>
      </Row>

      {active.length > 0 && <SectionTitle>{es ? 'Activos' : 'Active'}</SectionTitle>}
      <View style={{ gap: 10 }}>
        {active.map((p) => (
          <Card key={p.plan.id} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.plan.id } })} style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="label" style={{ flex: 1 }}>
                {p.plan.name}
              </Txt>
              <Txt variant="small" muted>
                {es ? 'Día' : 'Day'} {Math.min(p.plan.days, Math.max(1, p.todayIndex + 1))}/{p.plan.days}
              </Txt>
            </Row>
            <ProgressBar value={p.doneChapters / p.totalChapters} />
            <Txt variant="small" color={p.behind > 0 ? t.danger : t.success}>
              {p.behind > 0
                ? es
                  ? `${p.behind} capítulos atrasado`
                  : `${p.behind} chapters behind`
                : es
                  ? 'Al día ✓'
                  : 'On track ✓'}
            </Txt>
          </Card>
        ))}
      </View>

      <SectionTitle>{es ? 'Empezar un plan' : 'Start a plan'}</SectionTitle>
      <View style={styles.grid}>
        {PLAN_KINDS.map((k) => (
          <Card key={k.kind} onPress={() => open(k.kind)} style={styles.tile}>
            <Txt variant="label">{es ? k.es : k.en}</Txt>
            <Txt variant="small" muted>
              {es ? k.descEs : k.descEn}
            </Txt>
            <Txt variant="caption" color={t.accent}>
              {planChapters(k.kind).length} {es ? 'capítulos' : 'chapters'} · {k.days} {es ? 'días' : 'days'}
            </Txt>
          </Card>
        ))}
        <Card onPress={() => open('custom')} style={styles.tile}>
          <Txt variant="label">{es ? 'Personalizado' : 'Custom'}</Txt>
          <Txt variant="small" muted>
            {es ? 'Elige los libros y las fechas.' : 'Choose the books and the dates.'}
          </Txt>
        </Card>
      </View>

      {finished.length > 0 && (
        <>
          <SectionTitle>{es ? 'Completados' : 'Completed'}</SectionTitle>
          {finished.map((p) => (
            <Card key={p.plan.id} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.plan.id } })} style={{ marginBottom: 8 }}>
              <Txt variant="label">🏁 {p.plan.name}</Txt>
              {p.plan.completed_at && (
                <Txt variant="small" muted>
                  {new Date(p.plan.completed_at).toLocaleDateString()}
                </Txt>
              )}
            </Card>
          ))}
        </>
      )}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={es ? 'Nuevo plan' : 'New plan'}>
        {draft && (
          <View style={{ gap: 12 }}>
            <Txt variant="label">{es ? 'Nombre' : 'Name'}</Txt>
            <TextInput value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]} />

            {draft.kind === 'custom' && (
              <>
                <Txt variant="label">{es ? 'Libros' : 'Books'}</Txt>
                <View style={styles.bookWrap}>
                  {BOOKS.map((b) => {
                    const on = draft.books.includes(b.n);
                    return (
                      <Pressable
                        key={b.n}
                        onPress={() => setDraft({ ...draft, books: on ? draft.books.filter((x) => x !== b.n) : [...draft.books, b.n].sort((a, c) => a - c) })}
                        style={[styles.bookChip, { backgroundColor: on ? t.accent : t.cardAlt }]}>
                        <Txt variant="caption" color={on ? t.onAccent : t.text} style={{ fontWeight: '600' }}>
                          {lang === 'es' ? b.esAbbr : b.enAbbr}
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

            <Txt variant="label">{es ? 'Empezar' : 'Start'}</Txt>
            <Row>
              <Chip label={es ? 'Hoy' : 'Today'} selected={draft.start === 'today'} onPress={() => setDraft({ ...draft, start: 'today' })} />
              <Chip label={es ? 'Mañana' : 'Tomorrow'} selected={draft.start === 'tomorrow'} onPress={() => setDraft({ ...draft, start: 'tomorrow' })} />
            </Row>

            <Txt variant="label">{es ? 'Duración (días)' : 'Length (days)'}</Txt>
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
              {es ? '…o terminar para la fecha (AAAA-MM-DD):' : '…or finish by date (YYYY-MM-DD):'}
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
                {chapterCount} {es ? 'capítulos' : 'chapters'} · {daysNum} {es ? 'días' : 'days'}
              </Txt>
              <Txt variant="small" muted>
                {chapterCount
                  ? es
                    ? `≈ ${(chapterCount / daysNum).toFixed(1)} capítulos por día`
                    : `≈ ${(chapterCount / daysNum).toFixed(1)} chapters a day`
                  : es
                    ? 'Elige al menos un libro.'
                    : 'Pick at least one book.'}
              </Txt>
            </Card>
            <Button title={es ? 'Empezar plan' : 'Start plan'} icon="play" disabled={!chapterCount || !draft.name.trim()} onPress={save} />
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
