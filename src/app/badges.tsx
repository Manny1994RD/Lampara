import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, IconButton, Ionicons, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { getBadges, type Badge } from '@/lib/badges';
import { getSettings, updateSettings } from '@/lib/settings';

export default function BadgesScreen() {
  const t = useTheme();
  const { lang } = useTranslations();
  const es = lang === 'es';
  const badges = useLive((db) => getBadges(db), [], ['reads', 'highlights', 'notes', 'topics', 'bookmarks', 'plans']);

  // Visiting this screen marks every earned badge as seen.
  useEffect(() => {
    if (!badges) return;
    const earned = badges.filter((b) => b.earned).map((b) => b.id);
    const seen = new Set(getSettings().seenBadges);
    if (earned.some((id) => !seen.has(id))) updateSettings({ seenBadges: [...new Set([...seen, ...earned])] });
  }, [badges]);

  const groups: { key: Badge['group']; en: string; es: string }[] = [
    { key: 'habit', en: 'Habit', es: 'Hábito' },
    { key: 'bible', en: 'Through the Bible', es: 'Por la Biblia' },
    { key: 'study', en: 'Study', es: 'Estudio' },
  ];
  const earnedCount = badges?.filter((b) => b.earned).length ?? 0;

  return (
    <Screen>
      <Row>
        <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          {es ? 'Insignias' : 'Badges'}
        </Txt>
        <Txt variant="label" color={t.accent}>
          {earnedCount}/{badges?.length ?? 0}
        </Txt>
      </Row>
      {groups.map((g) => (
        <View key={g.key}>
          <SectionTitle>{es ? g.es : g.en}</SectionTitle>
          <View style={styles.grid}>
            {badges
              ?.filter((b) => b.group === g.key)
              .map((b) => (
                <Card key={b.id} style={[styles.badge, !b.earned && { opacity: 0.75 }]}>
                  <View style={[styles.medal, { backgroundColor: b.earned ? t.accent : t.cardAlt }]}>
                    <Ionicons name={b.earned ? b.icon : 'lock-closed'} size={26} color={b.earned ? t.onAccent : t.textSecondary} />
                  </View>
                  <Txt variant="label" style={{ textAlign: 'center' }} numberOfLines={2}>
                    {es ? b.es : b.en}
                  </Txt>
                  <Txt variant="caption" muted style={{ textAlign: 'center' }} numberOfLines={3}>
                    {es ? b.descEs : b.descEn}
                  </Txt>
                  {!b.earned && b.target > 1 && (
                    <View style={{ width: '100%', gap: 4 }}>
                      <ProgressBar value={b.current / b.target} height={6} />
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
  badge: { width: 150, flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 14 },
  medal: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
