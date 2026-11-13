import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons, useIsTablet, type IconName } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS: { name: string; href: '/' | '/read' | '/progress' | '/library' | '/settings'; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', href: '/', label: 'Today', icon: 'sunny-outline', iconActive: 'sunny' },
  { name: 'read', href: '/read', label: 'Read', icon: 'book-outline', iconActive: 'book' },
  { name: 'progress', href: '/progress', label: 'Progress', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'library', href: '/library', label: 'My Verses', icon: 'bookmarks-outline', iconActive: 'bookmarks' },
  { name: 'settings', href: '/settings', label: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
  const t = useTheme();
  const tablet = useIsTablet();
  const insets = useSafeAreaInsets();

  return (
    <Tabs style={{ flex: 1, flexDirection: tablet ? 'row' : 'column-reverse', backgroundColor: t.background }}>
      <TabList
        style={[
          tablet ? styles.rail : styles.bar,
          { backgroundColor: t.card, borderColor: t.border },
          tablet ? { paddingTop: insets.top + 16, paddingLeft: insets.left } : { paddingBottom: insets.bottom + 4 },
        ]}>
        {tablet && (
          <View style={styles.brand}>
            <Ionicons name="flame" size={26} color={t.accent} />
            <Text style={[styles.brandText, { color: t.text }]}>Lámpara</Text>
          </View>
        )}
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton tab={tab} tablet={tablet} />
          </TabTrigger>
        ))}
      </TabList>
      <TabSlot style={{ flex: 1 }} />
    </Tabs>
  );
}

function TabButton({
  tab,
  tablet,
  isFocused,
  ref,
  ...props
}: TabTriggerSlotProps & { tab?: (typeof TABS)[number]; tablet?: boolean }) {
    const t = useTheme();
    const color = isFocused ? t.accent : t.textSecondary;
    if (!tab) return null;
    return (
      <Pressable
        ref={ref as ComponentProps<typeof Pressable>['ref']}
        {...props}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        style={({ pressed }) => [
          tablet ? styles.railItem : styles.barItem,
          tablet && isFocused && { backgroundColor: t.accentSoft },
          pressed && { opacity: 0.7 },
        ]}>
        <Ionicons name={isFocused ? tab.iconActive : tab.icon} size={tablet ? 22 : 24} color={color} />
        <Text
          numberOfLines={1}
          style={[tablet ? styles.railLabel : styles.barLabel, { color, fontWeight: isFocused ? '700' : '500' }]}>
          {tab.label}
        </Text>
      </Pressable>
    );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  barItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  barLabel: { fontSize: 11 },
  rail: {
    width: 210,
    flexDirection: 'column',
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    gap: 4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 20 },
  brandText: { fontSize: 22, fontWeight: '700', fontFamily: Fonts.serif },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  railLabel: { fontSize: 15 },
});
