import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Empty, IconButton, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { localDay } from '@/lib/db';
import { useHub } from '@/lib/hub';
import {
  acceptFriend,
  addFriendByCode,
  challengeTarget,
  createInvite,
  deleteInvite,
  listChallenges,
  listFriends,
  listInvites,
  myMemberships,
  removeFriend,
} from '@/lib/social';

function share(message: string) {
  if (Platform.OS === 'web') {
    if (navigator.share) navigator.share({ text: message }).catch(() => undefined);
    else navigator.clipboard?.writeText(message);
  } else Share.share({ message });
}

export default function FriendsScreen() {
  const hub = useHub();
  const { t: tr } = useT();

  if (!hub) {
    return (
      <Screen>
        <Txt variant="title">{tr('tab.friends')}</Txt>
        <Empty
          icon="people"
          title={tr('friends.emptyTitle')}
          body={tr('friends.emptyBody')}
          action={<Button title={tr('settings.connect')} icon="cloud-outline" onPress={() => router.push('/hub')} style={{ marginTop: 8 }} />}
        />
      </Screen>
    );
  }
  return <Connected key={hub.user.id} />;
}

function Connected() {
  const t = useTheme();
  const { t: tr, tn } = useT();
  const hub = useHub()!;
  const today = localDay();
  const challenges = useRemote(async () => {
    const [list, mine] = await Promise.all([listChallenges(), myMemberships()]);
    return list.map((c) => ({ c, me: mine.find((m) => m.challenge === c.id) }));
  }, []);
  const friends = useRemote(() => listFriends(), []);
  const invites = useRemote(() => listInvites(), []);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const active = challenges.data?.filter((x) => x.c.end_day >= today) ?? [];
  const past = challenges.data?.filter((x) => x.c.end_day < today) ?? [];
  const incoming = friends.data?.filter((f) => f.status === 'pending' && f.incoming) ?? [];
  const accepted = friends.data?.filter((f) => f.status === 'accepted') ?? [];
  const outgoing = friends.data?.filter((f) => f.status === 'pending' && !f.incoming) ?? [];

  const add = async () => {
    setMsg(null);
    try {
      const u = await addFriendByCode(code);
      setMsg({ ok: true, text: tr('friends.sentTo', { name: u.name }) });
      setCode('');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const error = challenges.error ?? friends.error;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="title">{tr('tab.friends')}</Txt>
        <Button small kind="secondary" icon="add" title={tr('friends.newChallenge')} onPress={() => router.push('/challenge/new')} />
      </Row>
      <Txt muted variant="small">
        Signed in as {hub.user.name} · your friend code{' '}
        <Txt variant="small" color={t.accent} style={{ fontWeight: '700' }}>
          {hub.user.friend_code}
        </Txt>
      </Txt>
      {error && (
        <Card style={{ marginTop: 12, borderColor: t.danger }}>
          <Txt variant="small" color={t.danger}>
            {error}
          </Txt>
        </Card>
      )}

      <SectionTitle>{tr('friends.challenges')}</SectionTitle>
      {active.length === 0 ? (
        <Card style={{ gap: 8 }}>
          <Txt>{tr('friends.noChallenges')}</Txt>
          <Txt variant="small" muted>
            {tr('friends.noChallengesHint')}
          </Txt>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {active.map(({ c, me }) => {
            const target = challengeTarget(c);
            const daysLeft = Math.max(0, Math.round((new Date(`${c.end_day}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000));
            return (
              <Card key={c.id} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="label" style={{ flex: 1 }}>
                    {c.title}
                  </Txt>
                  <Txt variant="small" muted>
                    {c.start_day > today ? tr('friends.startsSoon') : tn('friends.daysLeft', daysLeft)}
                  </Txt>
                </Row>
                <ProgressBar value={me ? me.progress / target : 0} color={me?.done ? t.success : t.accent} />
                <Txt variant="small" muted>
                  You: {me?.progress ?? 0}/{target} {c.goal === 'days' ? 'days' : 'chapters'}
                  {me?.done ? ' · done 🏁' : ''}
                </Txt>
              </Card>
            );
          })}
        </View>
      )}

      {incoming.length > 0 && (
        <>
          <SectionTitle>{tr('friends.requests')}</SectionTitle>
          {incoming.map((f) => (
            <Card key={f.friendshipId} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="label" style={{ flex: 1 }}>
                  {f.user.name}
                </Txt>
                <Button small title={tr('friends.accept')} onPress={() => acceptFriend(f.friendshipId)} />
                <IconButton icon="close" label={tr('friends.decline')} onPress={() => removeFriend(f.friendshipId)} />
              </Row>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>{tr('tab.friends')}</SectionTitle>
      <Card style={{ gap: 4 }}>
        {accepted.length === 0 && outgoing.length === 0 && (
          <Txt variant="small" muted style={{ marginBottom: 6 }}>
            {tr('friends.addHint')}
          </Txt>
        )}
        {accepted.map((f) => (
          <Row key={f.friendshipId} style={[styles.row, { borderColor: t.border }]}>
            <Ionicons name="person-circle" size={28} color={t.accent} />
            <Txt variant="label" style={{ flex: 1 }}>
              {f.user.name}
            </Txt>
            <IconButton icon="person-remove-outline" size={18} label={`Remove ${f.user.name}`} color={t.textSecondary} onPress={() => removeFriend(f.friendshipId)} />
          </Row>
        ))}
        {outgoing.map((f) => (
          <Row key={f.friendshipId} style={[styles.row, { borderColor: t.border }]}>
            <Ionicons name="time-outline" size={24} color={t.textSecondary} />
            <Txt style={{ flex: 1 }} muted>
              {f.user.name} · request sent
            </Txt>
            <IconButton icon="close" size={18} label={tr('friends.cancelRequest')} onPress={() => removeFriend(f.friendshipId)} />
          </Row>
        ))}
        <Row style={{ marginTop: 10 }}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={tr('friends.code')}
            placeholderTextColor={t.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
          />
          <Button small title={tr('friends.add')} icon="person-add-outline" disabled={code.trim().length < 4} onPress={add} />
        </Row>
        {msg && (
          <Txt variant="small" color={msg.ok ? t.success : t.danger}>
            {msg.text}
          </Txt>
        )}
      </Card>

      <SectionTitle
        right={
          <Button
            small
            kind="ghost"
            icon="add"
            title={tr('friends.newInvite')}
            onPress={async () => {
              const inv = await createInvite();
              share(tr('friends.inviteMessage', { url: hub.url, code: inv.code }));
            }}
          />
        }>
        {tr('friends.invite')}
      </SectionTitle>
      <Card style={{ gap: 4 }}>
        <Txt variant="small" muted>
          {tr('friends.inviteHint')}
        </Txt>
        {(invites.data ?? []).map((inv) => (
          <Row key={inv.id} style={[styles.row, { borderColor: t.border }]}>
            <Txt variant="label" style={{ flex: 1, letterSpacing: 1 }}>
              {inv.code}
            </Txt>
            {inv.used_by ? (
              <Txt variant="small" muted>
                used by {inv.expand?.used_by?.name ?? 'someone'}
              </Txt>
            ) : (
              <>
                <IconButton icon="share-outline" size={18} label={tr('friends.shareInvite')} onPress={() => share(`Join me on Lámpara 📖\nHub: ${hub.url}\nInvite code: ${inv.code}`)} />
                <IconButton icon="trash-outline" size={18} label={tr('friends.deleteInvite')} color={t.textSecondary} onPress={() => deleteInvite(inv.id)} />
              </>
            )}
          </Row>
        ))}
      </Card>

      {past.length > 0 && (
        <>
          <SectionTitle>{tr('friends.finished')}</SectionTitle>
          {past.map(({ c, me }) => (
            <Card key={c.id} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })} style={{ marginBottom: 8 }}>
              <Txt variant="label">
                {me?.done ? '🏁 ' : ''}
                {c.title}
              </Txt>
              <Txt variant="small" muted>
                Ended {c.end_day}
              </Txt>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, letterSpacing: 1 },
});
