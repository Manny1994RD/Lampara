import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, IconButton, Ionicons, ProgressBar, Row, Screen, Txt } from '@/components/ui';
import { bookName } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { dayLabel, openChapter } from '@/lib/plan-format';
import { deletePlan, getPlanProgress, getPlans, setPlanStatus } from '@/lib/plans';

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const t = useTheme();
  const { lang } = useTranslations();
  const es = lang === 'es';
  const prog = useLive(
    async (d) => {
      const p = (await getPlans(d)).find((x) => x.id === id);
      return p ? getPlanProgress(d, p) : null;
    },
    [id],
    ['plans', 'reads']
  );

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/plans'));

  const remove = async () => {
    const msg = es ? 'Tu historial de lectura no se borra.' : 'Your reading history is kept.';
    const ok =
      Platform.OS === 'web'
        ? window.confirm(msg)
        : await new Promise<boolean>((r) =>
            Alert.alert(es ? '¿Borrar plan?' : 'Delete plan?', msg, [
              { text: 'Cancel', style: 'cancel', onPress: () => r(false) },
              { text: 'Delete', style: 'destructive', onPress: () => r(true) },
            ])
          );
    if (ok) {
      await deletePlan(db, id);
      back();
    }
  };

  if (prog === null) {
    return (
      <Screen>
        <IconButton icon="chevron-back" label="Back" onPress={back} />
        <Txt muted>{es ? 'Plan no encontrado.' : 'Plan not found.'}</Txt>
      </Screen>
    );
  }
  if (!prog) return <Screen>{null}</Screen>;

  const { plan, schedule, todayIndex } = prog;
  // Show from a little before today so the list stays manageable.
  const firstShown = Math.max(0, Math.min(todayIndex, prog.nextDay?.index ?? todayIndex) - 2);

  return (
    <Screen>
      <Row>
        <IconButton icon="chevron-back" label="Back" onPress={back} />
        <Txt variant="title" style={{ flex: 1 }} numberOfLines={2}>
          {plan.name}
        </Txt>
        <IconButton icon="trash-outline" label="Delete plan" color={t.danger} onPress={remove} />
      </Row>

      <Card style={{ gap: 8, marginTop: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">
            {prog.doneChapters}/{prog.totalChapters} {es ? 'capítulos' : 'chapters'}
          </Txt>
          <Txt variant="label" color={t.accent}>
            {Math.round((prog.doneChapters / prog.totalChapters) * 100)}%
          </Txt>
        </Row>
        <ProgressBar value={prog.doneChapters / prog.totalChapters} height={10} />
        <Txt variant="small" muted>
          {todayIndex < 0
            ? es
              ? `Empieza el ${plan.start_day}`
              : `Starts ${plan.start_day}`
            : `${es ? 'Día' : 'Day'} ${Math.min(plan.days, todayIndex + 1)} ${es ? 'de' : 'of'} ${plan.days} · ` +
              (prog.behind > 0
                ? es
                  ? `${prog.behind} capítulos atrasado`
                  : `${prog.behind} chapters behind`
                : es
                  ? 'al día'
                  : 'on track')}
        </Txt>
        {plan.status === 'active' && prog.behind > 0 && (
          <Txt variant="small" muted>
            {es
              ? 'No te preocupes: sigue con el próximo día pendiente, a tu ritmo.'
              : 'No worries — just continue with the next unfinished day at your own pace.'}
          </Txt>
        )}
        {prog.nextDay && plan.status === 'active' && (
          <Button
            title={`${es ? 'Leer' : 'Read'} ${dayLabel(prog.nextDay, lang)}`}
            icon="book"
            onPress={() => {
              const c = prog.nextDay!.chapters.find((x) => !x.done)!;
              openChapter(c.book, c.ch);
            }}
          />
        )}
        {plan.status === 'archived' && <Button kind="secondary" title={es ? 'Reanudar' : 'Resume'} onPress={() => setPlanStatus(db, plan.id, 'active')} />}
      </Card>

      <View style={{ gap: 8, marginTop: 16 }}>
        {firstShown > 0 && (
          <Txt variant="small" muted>
            {es ? `${firstShown} días anteriores completados u ocultos` : `${firstShown} earlier days hidden`}
          </Txt>
        )}
        {schedule.slice(firstShown).map((day) => {
          const isToday = day.index === todayIndex;
          return (
            <Card key={day.index} style={[{ paddingVertical: 12, gap: 6 }, isToday && { borderColor: t.accent, borderWidth: 2 }]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="caption" muted style={{ fontWeight: '700' }}>
                  {es ? 'DÍA' : 'DAY'} {day.index + 1} · {new Date(`${day.date}T12:00:00`).toLocaleDateString(es ? 'es' : 'en', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {isToday ? (es ? ' · HOY' : ' · TODAY') : ''}
                </Txt>
                {day.done && <Ionicons name="checkmark-circle" size={20} color={t.success} />}
              </Row>
              <Row style={{ flexWrap: 'wrap' }} gap={6}>
                {day.chapters.map((c) => (
                  <Pressable
                    key={`${c.book}:${c.ch}`}
                    onPress={() => openChapter(c.book, c.ch)}
                    style={({ pressed }) => [styles.ch, { backgroundColor: c.done ? t.accent : t.cardAlt, opacity: pressed ? 0.7 : 1 }]}>
                    <Txt variant="small" color={c.done ? t.onAccent : t.text} style={{ fontWeight: '600' }}>
                      {bookName(c.book, lang)} {c.ch}
                    </Txt>
                  </Pressable>
                ))}
              </Row>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ch: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});
