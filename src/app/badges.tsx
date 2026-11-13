import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, IconButton, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useT, type TKey } from '@/i18n';
import { getBadges, type Badge } from '@/lib/badges';
import { getSettings, updateSettings } from '@/lib/settings';

export default function BadgesScreen() {
  const t = useTheme();
  const { t: tr } = useT();
  const badges = useLive((db) => getBadges(db), [], ['reads', 'highlights', 'notes', 'topics', 'bookmarks', 'plans']);

  // Visiting this screen marks every earned badge as seen.
  useEffect(() => {
    if (!badges) return;
    const earned = badges.filter((b) => b.earned).map((b) => b.id);
    const seen = new Set(getSettings().seenBadges);
    if (earned.some((id) => !seen.has(id))) updateSettings({ seenBadges: [...new Set([...seen, ...earned])] });
  }, [badges]);

  const groups: { key: Badge['group']; label: TKey }[] = [
    { key: 'habit', label: 'badges.habit' },
    { key: 'bible', label: 'badges.bible' },
    { key: 'study', label: 'badges.study' },
  ];
  const earnedCount = badges?.filter((b) => b.earned).length ?? 0;

  return (
    <Screen>
      <Row>
        <IconButton icon="chevron-back" label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          {tr('badges.title')}
        </Txt>
        <Txt variant="label" color={t.accent}>
          {earnedCount}/{badges?.length ?? 0}
        </Txt>
      </Row>
      {groups.map((g) => (
        <View key={g.key}>
          <SectionTitle>{tr(g.label)}</SectionTitle>
          <View style={styles.grid}>
            {badges
              ?.filter((b) => b.group === g.key)
              .map((b) => (
                <Card key={b.id} style={[styles.badge, !b.earned && { opacity: 0.7 }]}>
                  <View style={[styles.medal, { backgroundColor: b.earned ? t.accent : t.cardAlt }]}>
                    <Ionicons name={b.earned ? b.icon : 'lock-closed'} size={26} color={b.earned ? '#fff' : t.textSecondary} />
                  </View>
                  <Txt variant="label" style={{ textAlign: 'center' }} numberOfLines={2}>
                    {tr(`badge.${b.id}` as TKey)}
                  </Txt>
                  <Txt variant="caption" muted style={{ textAlign: 'center' }} numberOfLines={3}>
                    {tr(`badge.${b.id}.desc` as TKey)}
                  </Txt>
                  {!b.earned && b.target > 1 && (
                    <View style={{ width: '100%', gap: 4 }}>
                      <ProgressBar value={b.current / b.target} height={5} />
                      <Txt variant="caption" muted style={{ textAlign: 'center' }}>
                        {b.current}/{b.target}
                      </Txt>
                    </View>
                  )}
                </Card>
              ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { width: 150, flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 16 },
  medal: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
