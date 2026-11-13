import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, IconButton, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { bookName } from '@/data/books';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { localDay } from '@/lib/db';
import { useHub } from '@/lib/hub';
import { challengeTarget, cheer, deleteChallenge, getChallenge, leaveChallenge, updateChallengeProgress } from '@/lib/social';
import { syncNow } from '@/lib/sync';

const CHEERS = ['🔥', '👏', '🙏', '💪', '❤️'];

function confirm(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((r) =>
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel', onPress: () => r(false) },
      { text: 'OK', style: 'destructive', onPress: () => r(true) },
    ])
  );
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso.replace(' ', 'T')).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const t = useTheme();
  const hub = useHub();
  const { lang } = useTranslations();
  const { data, error } = useRemote(() => getChallenge(id), [id]);
  const [cheerFor, setCheerFor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/friends'));
  if (!hub) return null;
  if (error && !data)
    return (
      <Screen>
        <IconButton icon="chevron-back" label="Back" onPress={back} />
        <Txt color={t.danger}>{error}</Txt>
      </Screen>
    );
  if (!data) return <Screen>{null}</Screen>;

  const { challenge: c, members, activity } = data;
  const target = challengeTarget(c);
  const today = localDay();
  const totalDays = Math.round((new Date(`${c.end_day}T12:00:00`).getTime() - new Date(`${c.start_day}T12:00:00`).getTime()) / 86400000) + 1;
  const elapsed = Math.min(totalDays, Math.max(0, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${c.start_day}T12:00:00`).getTime()) / 86400000) + 1));
  // Pace by the end of today, and the pace you must have already reached (days before today).
  const expectedPct = elapsed / totalDays;
  const duePct = Math.max(0, elapsed - 1) / totalDays;
  const me = members.find((m) => m.user === hub.user.id);
  const isOwner = c.owner === hub.user.id;
  const unit = c.goal === 'days' ? 'days' : 'chapters';
  const ended = c.end_day < today;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNow(db);
      await updateChallengeProgress(db);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen maxWidth={720}>
      <Row>
        <IconButton icon="chevron-back" label="Back" onPress={back} />
        <Txt variant="title" style={{ flex: 1 }} numberOfLines={2}>
          {c.title}
        </Txt>
        <IconButton icon="refresh" label="Refresh" onPress={refresh} active={refreshing} />
      </Row>
      {!!c.message && (
        <Txt muted style={{ marginBottom: 6 }}>
          “{c.message}” — {c.expand?.owner?.name}
        </Txt>
      )}

      <Card style={{ gap: 8, marginTop: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">
            Goal: {target} {unit}
          </Txt>
          <Txt variant="small" muted>
            {ended ? 'Finished' : today < c.start_day ? `Starts ${c.start_day}` : `Day ${elapsed} of ${totalDays}`}
          </Txt>
        </Row>
        {c.goal === 'books' && (
          <Txt variant="small" muted>
            {(c.books ?? []).map((b) => bookName(b, lang)).join(', ')}
          </Txt>
        )}
        <ProgressBar value={elapsed / totalDays} height={6} color={t.textSecondary} />
        <Txt variant="caption" muted>
          {`${c.start_day} → ${c.end_day} · on pace = ${Math.ceil(expectedPct * target)} ${unit} by the end of today`}
        </Txt>
      </Card>

      <SectionTitle>Leaderboard</SectionTitle>
      <View style={{ gap: 10 }}>
        {members.map((m, i) => {
          const pct = m.progress / target;
          const behind = !m.done && !ended && pct + 0.0001 < duePct;
          const isMe = m.user === hub.user.id;
          const name = isMe ? 'You' : (m.expand?.user?.name ?? 'Friend');
          return (
            <Card key={m.id} style={[{ gap: 8 }, isMe && { borderColor: t.accent, borderWidth: 1.5 }]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row>
                  <Txt variant="label" color={i === 0 && m.progress > 0 ? t.accent : undefined}>
                    {i === 0 && m.progress > 0 ? '🏆 ' : `${i + 1}. `}
                    {name}
                  </Txt>
                  {m.done && <Txt variant="small">🏁</Txt>}
                </Row>
                <Txt variant="small" muted>
                  {m.progress}/{target}
                  {behind ? ' · behind pace' : ''}
                </Txt>
              </Row>
              <ProgressBar value={pct} height={10} color={m.done ? t.success : t.accent} />
              {!isMe && !ended && (
                <>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Button small kind="secondary" icon="heart-outline" title="Cheer" onPress={() => setCheerFor(cheerFor === m.user ? null : m.user)} />
                    {behind && (
                      <Button small kind="ghost" icon="notifications-outline" title="Nudge" onPress={() => m.expand?.user && cheer(c.id, m.expand.user, '👋', 'nudge')} />
                    )}
                  </Row>
                  {cheerFor === m.user && (
                    <Row gap={8}>
                      {CHEERS.map((e) => (
                        <Pressable
                          key={e}
                          accessibilityLabel={`Send ${e}`}
                          onPress={async () => {
                            if (m.expand?.user) await cheer(c.id, m.expand.user, e);
                            setCheerFor(null);
                          }}
                          style={({ pressed }) => [styles.emoji, { backgroundColor: t.cardAlt, opacity: pressed ? 0.6 : 1 }]}>
                          <Txt style={{ fontSize: 22 }}>{e}</Txt>
                        </Pressable>
                      ))}
                    </Row>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </View>
      <Txt variant="caption" muted style={{ marginTop: 8 }}>
        Progress counts the chapters you mark as read in Lámpara between the start and end dates. It updates when your
        devices sync.
      </Txt>

      <SectionTitle>Activity</SectionTitle>
      <Card style={{ gap: 2 }}>
        {activity.length === 0 && (
          <Txt variant="small" muted>
            Nothing yet.
          </Txt>
        )}
        {activity.map((a) => {
          const forMe = a.target === hub.user.id;
          return (
            <Row key={a.id} style={[styles.activity, { borderColor: t.border }]} gap={10}>
              <Txt style={{ fontSize: 20, width: 28, textAlign: 'center' }}>
                {a.emoji || (a.kind === 'completed' ? '🏁' : a.kind === 'joined' ? '👋' : a.kind === 'progress' ? '📖' : '✨')}
              </Txt>
              <Txt variant="small" style={{ flex: 1 }} color={forMe ? t.accent : undefined}>
                {a.text}
              </Txt>
              <Txt variant="caption" muted>
                {ago(a.created)}
              </Txt>
            </Row>
          );
        })}
      </Card>

      <Row style={{ marginTop: 20, flexWrap: 'wrap' }}>
        {me && !isOwner && (
          <Button
            kind="danger"
            small
            icon="exit-outline"
            title="Leave challenge"
            onPress={async () => {
              if (await confirm('Leave this challenge?', 'Your reading history is not affected.')) {
                await leaveChallenge(me.id);
                back();
              }
            }}
          />
        )}
        {isOwner && (
          <Button
            kind="danger"
            small
            icon="trash-outline"
            title="Delete challenge"
            onPress={async () => {
              if (await confirm('Delete this challenge?', 'It is removed for everyone in it.')) {
                await deleteChallenge(c.id);
                back();
              }
            }}
          />
        )}
      </Row>
      <View style={{ height: 20 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  emoji: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  activity: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
