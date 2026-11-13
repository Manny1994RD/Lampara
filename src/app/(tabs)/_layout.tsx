import { Redirect, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons, useIsTablet, type IconName } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT, type TKey } from '@/i18n';
import { useTranslations } from '@/hooks/use-translation';
import { useHub } from '@/lib/hub';
import { useSettings } from '@/lib/settings';

const TABS: {
  name: string;
  href: '/' | '/read' | '/progress' | '/library' | '/friends' | '/settings';
  label: TKey;
  icon: IconName;
  iconActive: IconName;
}[] = [
  { name: 'index', href: '/', label: 'tab.today', icon: 'sunny-outline', iconActive: 'sunny' },
  { name: 'read', href: '/read', label: 'tab.read', icon: 'book-outline', iconActive: 'book' },
  { name: 'progress', href: '/progress', label: 'tab.progress', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'library', href: '/library', label: 'tab.verses', icon: 'bookmarks-outline', iconActive: 'bookmarks' },
  { name: 'friends', href: '/friends', label: 'tab.friends', icon: 'people-outline', iconActive: 'people' },
  { name: 'settings', href: '/settings', label: 'tab.settings', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
  const t = useTheme();
  const tablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // Full-screen reading hides the menu (the reader has its own button to bring it back).
  const settings = useSettings();
  const hidden = settings.readerFullscreen && pathname === '/read';
  const hub = useHub();
  const { list } = useTranslations();
  // First start (nothing on this device, not signed in): the welcome steps.
  const firstStart = !settings.onboarded && !hub && list?.length === 0;

  if (firstStart) return <Redirect href="/welcome" />;

  return (
    <Tabs style={{ flex: 1, flexDirection: tablet ? 'row' : 'column-reverse', backgroundColor: t.background }}>
      <TabList
        style={[
          tablet ? styles.rail : styles.bar,
          { backgroundColor: t.background, borderColor: t.border },
          tablet ? { paddingTop: insets.top + 16, paddingLeft: insets.left } : { paddingBottom: insets.bottom + 4 },
          hidden && { display: 'none' },
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
    const { t: tr } = useT();
    const color = isFocused ? t.text : t.textSecondary;
    if (!tab) return null;
    return (
      <Pressable
        ref={ref as ComponentProps<typeof Pressable>['ref']}
        {...props}
        accessibilityRole="tab"
        accessibilityLabel={tr(tab.label)}
        style={({ pressed }) => [
          tablet ? styles.railItem : styles.barItem,
          tablet && isFocused && { backgroundColor: t.card },
          pressed && { opacity: 0.7 },
        ]}>
        <Ionicons name={isFocused ? tab.iconActive : tab.icon} size={tablet ? 22 : 24} color={color} />
        <Text
          numberOfLines={1}
          style={[tablet ? styles.railLabel : styles.barLabel, { color, fontWeight: isFocused ? '700' : '500' }]}>
          {tr(tab.label)}
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
    // TabList spreads items over the full height by default; keep them together at the top.
    justifyContent: 'flex-start',
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    gap: 4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 20 },
  brandText: { fontSize: 22, fontWeight: '700', fontFamily: Fonts.sans },
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
