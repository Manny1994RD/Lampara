import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, IconButton, Ionicons, Row, Screen, Txt } from '@/components/ui';
import { BOOKS, bookAbbr, bookName } from '@/data/books';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useTranslations } from '@/hooks/use-translation';
import { localDay } from '@/lib/db';
import { challengeTarget, createChallenge, listFriends, type Goal } from '@/lib/social';

const LENGTHS = [7, 14, 21, 30, 40];

export default function NewChallengeScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: tr } = useT();
  const { lang } = useTranslations();
  const friends = useRemote(() => listFriends(), []);
  const accepted = friends.data?.filter((f) => f.status === 'accepted') ?? [];

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [goal, setGoal] = useState<Goal>('chapters');
  const [target, setTarget] = useState('30');
  const [books, setBooks] = useState<number[]>([]);
  const [days, setDays] = useState(14);
  const [startTomorrow, setStartTomorrow] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = new Date();
  if (startTomorrow) start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  const targetNum = goal === 'books' ? challengeTarget({ goal, target: 0, books }) : Math.max(1, parseInt(target || '0', 10) || 0);

  const suggestedTitle =
    goal === 'chapters'
      ? tr('challenge.title.chapters', { n: targetNum, d: days })
      : goal === 'days'
        ? tr('challenge.title.days', { n: targetNum, d: days })
        : tr('challenge.title.books', {
            books: books.length
              ? `${books.map((b) => bookName(b, lang)).slice(0, 3).join(', ')}${books.length > 3 ? '…' : ''}`
              : '…',
          });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await createChallenge(
        db,
        {
          title: title.trim() || suggestedTitle,
          message: message.trim(),
          goal,
          target: targetNum,
          books,
          start_day: localDay(start),
          end_day: localDay(end),
        },
        invited
      );
      router.replace({ pathname: '/challenge/[id]', params: { id: c.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }];

  return (
    <Screen maxWidth={640}>
      <Row>
        <IconButton icon="chevron-back" label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/friends'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          {tr('friends.newChallenge')}
        </Txt>
      </Row>

      <View style={{ gap: 14, marginTop: 8 }}>
        <Txt variant="label">{tr('challenge.goal')}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip icon="book-outline" label={tr('challenge.goal.chapters')} selected={goal === 'chapters'} onPress={() => setGoal('chapters')} />
          <Chip icon="calendar-outline" label={tr('challenge.goal.days')} selected={goal === 'days'} onPress={() => { setGoal('days'); setTarget(String(days)); }} />
          <Chip icon="library-outline" label={tr('challenge.goal.books')} selected={goal === 'books'} onPress={() => setGoal('books')} />
        </Row>

        <Txt variant="label">{tr('challenge.length')}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {LENGTHS.map((d) => (
            <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => { setDays(d); if (goal === 'days') setTarget(String(d)); }} />
          ))}
        </Row>
        <Row>
          <Chip label={tr('challenge.startToday')} selected={!startTomorrow} onPress={() => setStartTomorrow(false)} />
          <Chip label={tr('challenge.startTomorrow')} selected={startTomorrow} onPress={() => setStartTomorrow(true)} />
        </Row>
        <Txt variant="small" muted>
          {localDay(start)} → {localDay(end)}
        </Txt>

        {goal !== 'books' ? (
          <>
            <Txt variant="label">{goal === 'chapters' ? tr('challenge.howManyChapters') : tr('challenge.howManyDays')}</Txt>
            <TextInput value={target} onChangeText={(v) => setTarget(v.replace(/\D/g, ''))} keyboardType="number-pad" style={[input, { width: 120 }]} />
          </>
        ) : (
          <>
            <Txt variant="label">{tr('challenge.whichBooks')}</Txt>
            <View style={styles.bookWrap}>
              {BOOKS.map((b) => {
                const on = books.includes(b.n);
                return (
                  <Pressable
                    key={b.n}
                    onPress={() => setBooks(on ? books.filter((x) => x !== b.n) : [...books, b.n].sort((a, c) => a - c))}
                    style={[styles.bookChip, { backgroundColor: on ? t.accent : t.cardAlt }]}>
                    <Txt variant="caption" color={on ? t.onAccent : t.text} style={{ fontWeight: '600' }}>
                      {bookAbbr(b.n, lang)}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <Txt variant="small" muted>
              {targetNum} chapters to read
            </Txt>
          </>
        )}

        <Txt variant="label">{tr('plans.name')}</Txt>
        <TextInput value={title} onChangeText={setTitle} placeholder={suggestedTitle} placeholderTextColor={t.textSecondary} style={input} />
        <Txt variant="label">{tr('challenge.message')}</Txt>
        <TextInput value={message} onChangeText={setMessage} placeholder={tr('challenge.messagePlaceholder')} placeholderTextColor={t.textSecondary} style={input} />

        <Txt variant="label">{tr('challenge.inviteFriends')}</Txt>
        {accepted.length === 0 ? (
          <Txt variant="small" muted>
            {tr('challenge.noFriends')}
          </Txt>
        ) : (
          <Card style={{ gap: 2 }}>
            {accepted.map((f) => {
              const on = invited.includes(f.user.id);
              return (
                <Pressable
                  key={f.user.id}
                  onPress={() => setInvited(on ? invited.filter((x) => x !== f.user.id) : [...invited, f.user.id])}
                  style={[styles.friendRow, { borderColor: t.border }]}>
                  <Txt variant="label" style={{ flex: 1 }}>
                    {f.user.name}
                  </Txt>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? t.accent : t.textSecondary} />
                </Pressable>
              );
            })}
          </Card>
        )}

        {error && (
          <Txt variant="small" color={t.danger}>
            {error}
          </Txt>
        )}
        <Button title={tr('challenge.start')} icon="flag" loading={busy} disabled={targetNum < 1} onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  bookWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  bookChip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, minWidth: 40, alignItems: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
