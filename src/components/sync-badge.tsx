import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Ionicons, Txt, type IconName } from '@/components/ui';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useHub } from '@/lib/hub';
import { getSyncInfo, useSyncPhase } from '@/lib/sync';

/** Small label: "Saved on this device" / "Syncing…" / "Synced" / "Waiting for connection". Tap for Settings. */
export function SyncBadge({ style }: { style?: object }) {
  const t = useTheme();
  const { t: tr, tn } = useT();
  const hub = useHub();
  const phase = useSyncPhase();
  const info = useLive((d) => getSyncInfo(d), [], ['hub', 'reads', 'highlights', 'notes', 'topics', 'bookmarks', 'plans']);
  const pending = info?.pending ?? 0;

  let icon: IconName = 'phone-portrait-outline';
  let text = tr('sync.local');
  let color = t.textSecondary;
  if (hub) {
    if (phase === 'syncing') {
      icon = 'sync';
      text = tr('sync.syncing');
    } else if (phase === 'offline') {
      icon = 'cloud-offline-outline';
      text = pending ? tn('sync.waitingN', pending) : tr('sync.waiting');
      color = t.accent;
    } else if (phase === 'error') {
      icon = 'alert-circle-outline';
      text = tr('sync.error');
      color = t.danger;
    } else if (pending) {
      icon = 'cloud-upload-outline';
      text = tn('sync.pendingN', pending);
    } else {
      icon = 'cloud-done-outline';
      text = tr('sync.synced');
      color = t.success;
    }
  }

  return (
    <Pressable
      onPress={() => router.navigate('/settings')}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={({ pressed }) => [styles.badge, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }, style]}>
      <Ionicons name={icon} size={14} color={color} />
      <Txt variant="caption" color={color} style={{ fontWeight: '700' }} numberOfLines={1}>
        {text}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
});
