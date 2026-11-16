import { router } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { SyncBadge } from '@/components/sync-badge';
import { Button, Card, IconButton, Ionicons, Row, Screen, SectionTitle, Txt, type IconName } from '@/components/ui';
import { useLive } from '@/hooks/use-live';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { useT, type TKey } from '@/i18n';
import { localDay } from '@/lib/db';
import { useHub } from '@/lib/hub';
import { listChallenges, listFriends } from '@/lib/social';

function share(message: string) {
  if (Platform.OS === 'web') {
    if (navigator.share) navigator.share({ text: message }).catch(() => undefined);
    else navigator.clipboard?.writeText(message);
  } else Share.share({ message });
}

const TILES: { key: 'highlights' | 'bookmarks' | 'notes' | 'topics'; label: TKey; icon: IconName }[] = [
  { key: 'highlights', label: 'library.highlights', icon: 'color-wand-outline' },
  { key: 'bookmarks', label: 'library.bookmarks', icon: 'bookmark-outline' },
  { key: 'notes', label: 'library.notes', icon: 'create-outline' },
  { key: 'topics', label: 'library.topics', icon: 'pricetags-outline' },
];

/** Yo: your account and friend code, your saved verses, friends and challenges. Settings are behind the gear. */
export default function MeScreen() {
  const t = useTheme();
  const { t: tr, tn } = useT();
  const hub = useHub();
  const counts = useLive(
    async (db) => {
      const one = async (sql: string) => (await db.getFirstAsync<{ c: number }>(sql))?.c ?? 0;
      return {
        highlights: await one('SELECT COUNT(DISTINCT book || \':\' || ch || \':\' || v) AS c FROM highlights'),
        bookmarks: await one('SELECT COUNT(*) AS c FROM bookmarks'),
        notes: await one('SELECT COUNT(*) AS c FROM notes'),
        topics: await one('SELECT COUNT(*) AS c FROM topics'),
        plans: await one("SELECT COUNT(*) AS c FROM plans WHERE status = 'active'"),
      };
    },
    [],
    ['highlights', 'bookmarks', 'notes', 'topics', 'plans']
  );
  const social = useRemote(async () => {
    if (!hub) return null;
    const [challenges, friends] = await Promise.all([listChallenges(), listFriends()]);
    const today = localDay();
    return {
      challenges: challenges.filter((c) => c.end_day >= today).length,
      friends: friends.filter((f) => f.status === 'accepted').length,
      requests: friends.filter((f) => f.status === 'pending' && f.incoming).length,
    };
  }, [hub?.user.id ?? '']);

  const connectCard = (
    <Card style={{ gap: 8 }}>
      <Row gap={8}>
        <Ionicons name="cloud-outline" size={20} color={t.accent} />
        <Txt variant="label">{tr('me.connectTitle')}</Txt>
      </Row>
      <Txt variant="small" muted>
        {tr('me.connectBody')}
      </Txt>
      <Button small icon="log-in-outline" title={tr('settings.connect')} onPress={() => router.push('/hub')} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );

  return (
    <Screen maxWidth={720}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="title">{tr('tab.me')}</Txt>
        <IconButton icon="settings-outline" size={24} label={tr('tab.settings')} onPress={() => router.push('/settings')} />
      </Row>

      {/* You */}
      {hub ? (
        <Card style={{ gap: 10, marginTop: 8 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{hub.user.name}</Txt>
              <Txt variant="small" muted>
                {tr('me.friendCode')}{' '}
                <Txt variant="small" color={t.accent} style={{ fontWeight: '800', letterSpacing: 1 }}>
                  {hub.user.friend_code}
                </Txt>
              </Txt>
            </View>
            <SyncBadge />
          </Row>
          <Button
            kind="secondary"
            icon="share-social-outline"
            title={tr('me.shareCode')}
            onPress={() =>
              share(tr('me.shareCodeMessage', { name: hub.user.name, code: hub.user.friend_code, link: `${hub.url}/friends?add=${hub.user.friend_code}` }))
            }
          />
        </Card>
      ) : (
        <View style={{ marginTop: 8 }}>{connectCard}</View>
      )}

      {/* Mis versículos */}
      <SectionTitle>{tr('me.verses')}</SectionTitle>
      <View style={styles.tiles}>
        {TILES.map((x) => (
          <Pressable
            key={x.key}
            onPress={() => router.push({ pathname: '/library', params: { tab: x.key } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tile, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.8 : 1 }]}>
            <Ionicons name={x.icon} size={22} color={t.accent} />
            <Txt variant="title" style={{ fontSize: 26 }}>
              {counts?.[x.key] ?? 0}
            </Txt>
            <Txt variant="small" muted>
              {tr(x.label)}
            </Txt>
          </Pressable>
        ))}
      </View>

      {/* Planes de lectura (start one here; active plans also show on Hoy) */}
      <SectionTitle>{tr('me.plans')}</SectionTitle>
      <Card style={{ gap: 6 }} onPress={() => router.push('/plans')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="label">{counts?.plans ? tn('me.plansN', counts.plans) : tr('today.startPlan')}</Txt>
            <Txt variant="small" muted>
              {tr('me.plansNone')}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
        </Row>
      </Card>

      {/* Amigos y retos */}
      <SectionTitle>{tr('me.friends')}</SectionTitle>
      {hub ? (
        <Card style={{ gap: 10 }} onPress={() => router.push('/friends')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="label">
                {tn('me.challengesN', social.data?.challenges ?? 0)} · {tn('me.friendsN', social.data?.friends ?? 0)}
              </Txt>
              {!!social.data?.requests && (
                <Txt variant="small" color={t.accent} style={{ fontWeight: '700' }}>
                  {tn('me.requestsN', social.data.requests)}
                </Txt>
              )}
              <Txt variant="small" muted>
                {tr('me.friendsHint')}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
          </Row>
        </Card>
      ) : (
        connectCard
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 2 },
});
