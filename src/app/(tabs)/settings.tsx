import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ImportButton } from '@/components/import-button';
import { Card, Chip, IconButton, Ionicons, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { deleteTranslation } from '@/lib/importer';
import { ensureNotificationPermission, notificationsSupported } from '@/lib/notifications';
import { updateSettings, useSettings } from '@/lib/settings';

function confirm(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((resolve) =>
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const settings = useSettings();
  const { list, current } = useTranslations();

  return (
    <Screen>
      <Txt variant="title">Settings</Txt>

      <SectionTitle>Bibles on this device</SectionTitle>
      <Card style={{ gap: 4 }}>
        {(list ?? []).length === 0 && (
          <Txt muted style={{ marginBottom: 8 }}>
            No Bibles imported yet.
          </Txt>
        )}
        {(list ?? []).map((x) => (
          <View key={x.id} style={[styles.row, { borderColor: t.border }]}>
            <Pressable style={{ flex: 1 }} onPress={() => updateSettings({ translationId: x.id })}>
              <Row>
                <Txt variant="label">{x.abbr}</Txt>
                {x.id === current?.id && <Ionicons name="checkmark-circle" size={18} color={t.accent} />}
              </Row>
              <Txt variant="small" muted numberOfLines={1}>
                {x.name}
              </Txt>
              <Txt variant="caption" muted>
                {x.lang === 'es' ? 'Español' : 'English'} · {x.verse_count.toLocaleString()} verses
                {!x.has_ot ? ' · NT only' : !x.has_nt ? ' · OT only' : ''}
              </Txt>
            </Pressable>
            <IconButton
              icon="trash-outline"
              label={`Remove ${x.abbr}`}
              color={t.danger}
              onPress={async () => {
                if (await confirm(`Remove ${x.abbr}?`, 'The Bible text is removed from this device. Your highlights, notes and reading progress are kept (word highlights made in this translation are removed).')) {
                  await deleteTranslation(db, x.id);
                  if (settings.translationId === x.id) updateSettings({ translationId: null });
                }
              }}
            />
          </View>
        ))}
        <View style={{ marginTop: 12 }}>
          <ImportButton />
        </View>
        <Txt variant="caption" muted style={{ marginTop: 8 }}>
          Supports e-Sword Bible files (.bblx). Bibles you import stay on this device and are never uploaded.
        </Txt>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      {notificationsSupported ? (
        <Card style={{ gap: 14 }}>
          <NotifRow
            title="Verse of the day"
            subtitle="A verse from your Bible every morning."
            enabled={settings.votdEnabled}
            hour={settings.votdHour}
            minute={settings.votdMinute}
            onToggle={async (on) => {
              if (on && !(await ensureNotificationPermission())) return;
              updateSettings({ votdEnabled: on });
            }}
            onTime={(h, m) => updateSettings({ votdHour: h, votdMinute: m })}
          />
          <NotifRow
            title="Reading reminder"
            subtitle="Only if you haven't read yet that day."
            enabled={settings.reminderEnabled}
            hour={settings.reminderHour}
            minute={settings.reminderMinute}
            onToggle={async (on) => {
              if (on && !(await ensureNotificationPermission())) return;
              updateSettings({ reminderEnabled: on });
            }}
            onTime={(h, m) => updateSettings({ reminderHour: h, reminderMinute: m })}
          />
        </Card>
      ) : (
        <Txt muted variant="small">
          Notifications are available in the Android and iPhone app.
        </Txt>
      )}

      <SectionTitle>Book names</SectionTitle>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="Match translation" selected={settings.bookNames === 'auto'} onPress={() => updateSettings({ bookNames: 'auto' })} />
        <Chip label="Español" selected={settings.bookNames === 'es'} onPress={() => updateSettings({ bookNames: 'es' })} />
        <Chip label="English" selected={settings.bookNames === 'en'} onPress={() => updateSettings({ bookNames: 'en' })} />
      </Row>

      <SectionTitle>Text size</SectionTitle>
      <Row>
        <IconButton icon="remove-circle-outline" size={30} label="Smaller" onPress={() => updateSettings({ fontSize: Math.max(13, settings.fontSize - 1) })} />
        <Txt variant="heading">{settings.fontSize}</Txt>
        <IconButton icon="add-circle-outline" size={30} label="Bigger" onPress={() => updateSettings({ fontSize: Math.min(34, settings.fontSize + 1) })} />
      </Row>

      <SectionTitle>About</SectionTitle>
      <Card style={{ gap: 6 }}>
        <Txt variant="label">Lámpara 0.2 · Phase 2</Txt>
        <Txt variant="small" muted>
          “Lámpara es a mis pies tu palabra, y lumbrera a mi camino.” — Salmo 119:105
        </Txt>
        <Txt variant="small" muted>
          Coming next: tablet book mode, friend challenges and focus lock.
        </Txt>
      </Card>
    </Screen>
  );
}

const TIMES = [6, 7, 8, 9, 12, 18, 20, 21, 22];

function NotifRow({
  title,
  subtitle,
  enabled,
  hour,
  minute,
  onToggle,
  onTime,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  hour: number;
  minute: number;
  onToggle: (on: boolean) => void;
  onTime: (h: number, m: number) => void;
}) {
  const fmt = (h: number, m: number) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return (
    <View style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{title}</Txt>
          <Txt variant="small" muted>
            {subtitle}
          </Txt>
        </View>
        <Switch value={enabled} onValueChange={onToggle} />
      </Row>
      {enabled && (
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {TIMES.map((h) => (
            <Chip key={h} label={fmt(h, 0)} selected={hour === h && minute === 0} onPress={() => onTime(h, 0)} />
          ))}
        </Row>
      )}
      {enabled && !TIMES.includes(hour) && (
        <Txt variant="caption" muted>
          {fmt(hour, minute)}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
