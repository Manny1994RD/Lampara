import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, IconButton, Ionicons, Row, Screen, Txt } from '@/components/ui';
import { BOOKS, bookName } from '@/data/books';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { localDay } from '@/lib/db';
import { challengeTarget, createChallenge, listFriends, type Goal } from '@/lib/social';

const LENGTHS = [7, 14, 21, 30, 40];

export default function NewChallengeScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
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
      ? `${targetNum} chapters in ${days} days`
      : goal === 'days'
        ? `Read ${targetNum} of ${days} days`
        : books.length
          ? `Finish ${books.map((b) => bookName(b, lang)).slice(0, 3).join(', ')}${books.length > 3 ? '…' : ''}`
          : 'Finish books';

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
        <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/friends'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          New challenge
        </Txt>
      </Row>

      <View style={{ gap: 14, marginTop: 8 }}>
        <Txt variant="label">Goal</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip icon="book-outline" label="Read chapters" selected={goal === 'chapters'} onPress={() => setGoal('chapters')} />
          <Chip icon="calendar-outline" label="Read on days" selected={goal === 'days'} onPress={() => { setGoal('days'); setTarget(String(days)); }} />
          <Chip icon="library-outline" label="Finish books" selected={goal === 'books'} onPress={() => setGoal('books')} />
        </Row>

        <Txt variant="label">Length</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {LENGTHS.map((d) => (
            <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => { setDays(d); if (goal === 'days') setTarget(String(d)); }} />
          ))}
        </Row>
        <Row>
          <Chip label="Start today" selected={!startTomorrow} onPress={() => setStartTomorrow(false)} />
          <Chip label="Start tomorrow" selected={startTomorrow} onPress={() => setStartTomorrow(true)} />
        </Row>
        <Txt variant="small" muted>
          {localDay(start)} → {localDay(end)}
        </Txt>

        {goal !== 'books' ? (
          <>
            <Txt variant="label">{goal === 'chapters' ? 'How many chapters?' : 'On how many days?'}</Txt>
            <TextInput value={target} onChangeText={(v) => setTarget(v.replace(/\D/g, ''))} keyboardType="number-pad" style={[input, { width: 120 }]} />
          </>
        ) : (
          <>
            <Txt variant="label">Which books?</Txt>
            <View style={styles.bookWrap}>
              {BOOKS.map((b) => {
                const on = books.includes(b.n);
                return (
                  <Pressable
                    key={b.n}
                    onPress={() => setBooks(on ? books.filter((x) => x !== b.n) : [...books, b.n].sort((a, c) => a - c))}
                    style={[styles.bookChip, { backgroundColor: on ? t.accent : t.cardAlt }]}>
                    <Txt variant="caption" color={on ? t.onAccent : t.text} style={{ fontWeight: '600' }}>
                      {lang === 'es' ? b.esAbbr : b.enAbbr}
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

        <Txt variant="label">Name</Txt>
        <TextInput value={title} onChangeText={setTitle} placeholder={suggestedTitle} placeholderTextColor={t.textSecondary} style={input} />
        <Txt variant="label">Message (optional)</Txt>
        <TextInput value={message} onChangeText={setMessage} placeholder="Let's do this together! 💪" placeholderTextColor={t.textSecondary} style={input} />

        <Txt variant="label">Invite friends</Txt>
        {accepted.length === 0 ? (
          <Txt variant="small" muted>
            Add friends first on the Friends screen — or start it on your own.
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
        <Button title="Start challenge" icon="flag" loading={busy} disabled={targetNum < 1} onPress={save} />
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
