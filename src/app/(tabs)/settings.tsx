import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { useLive } from '@/hooks/use-live';
import { signOut, useHub } from '@/lib/hub';
import { updateChallengeProgress } from '@/lib/social';
import { getSyncInfo, resetSyncState, syncNow } from '@/lib/sync';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ImportButton } from '@/components/import-button';
import { Button, Card, Chip, IconButton, Ionicons, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, getT, useT } from '@/i18n';
import { useTranslations } from '@/hooks/use-translation';
import type { Translation } from '@/lib/data';
import { deleteFromHub, forgetStreamingBibles, listHubBibles, removeFromDevice, saveOffline, uploadBible, type Progress } from '@/lib/hub-bibles';
import { deleteTranslation } from '@/lib/importer';
import { ensureNotificationPermission, notificationsSupported } from '@/lib/notifications';
import { updateSettings, useSettings } from '@/lib/settings';

function confirm(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((resolve) =>
    Alert.alert(title, msg, [
      { text: getT().t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: getT().t('common.remove'), style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

export default function SettingsScreen() {
  const { t: tr } = useT();
  const settings = useSettings();
  const { list, current } = useTranslations();
  const hub = useHub();
  // Only the hub owner can upload or delete Bibles on the hub.
  const canManage = useLive(
    async () => (hub ? ((await listHubBibles().catch(() => null))?.can_manage ?? false) : false),
    [hub?.user.id ?? ''],
    ['hub']
  );

  return (
    <Screen>
      <Txt variant="title">{tr('tab.settings')}</Txt>

      <SectionTitle>{tr('settings.language')}</SectionTitle>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip
          icon="phone-portrait-outline"
          label={tr('settings.languageAuto')}
          selected={settings.appLanguage === 'auto'}
          onPress={() => updateSettings({ appLanguage: 'auto' })}
        />
        {LANGUAGES.map((l) => (
          <Chip key={l.code} label={l.name} selected={settings.appLanguage === l.code} onPress={() => updateSettings({ appLanguage: l.code })} />
        ))}
      </Row>

      <SectionTitle>{tr('settings.bibles')}</SectionTitle>
      <Card style={{ gap: 4 }}>
        {(list ?? []).length === 0 && (
          <Txt muted style={{ marginBottom: 8 }}>
            {tr('settings.noBibles')}
          </Txt>
        )}
        {(list ?? []).map((x) => (
          <BibleRow key={x.id} x={x} selected={x.id === current?.id} canManage={!!canManage} signedIn={!!hub} />
        ))}
        <View style={{ marginTop: 12 }}>
          <ImportButton />
        </View>
        <Txt variant="caption" muted style={{ marginTop: 8 }}>
          {tr('settings.bblxHint')}
        </Txt>
        {hub && (
          <Txt variant="caption" muted style={{ marginTop: 4 }}>
            {tr('bibles.hubHint')}
          </Txt>
        )}
      </Card>

      <SectionTitle>{tr('settings.hub')}</SectionTitle>
      <HubCard />

      <SectionTitle>{tr('settings.notifications')}</SectionTitle>
      {notificationsSupported ? (
        <Card style={{ gap: 14 }}>
          <NotifRow
            title={tr('today.votd')}
            subtitle={tr('settings.votdHint')}
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
            title={tr('settings.reminder')}
            subtitle={tr('settings.reminderHint')}
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
          {tr('settings.notifWebOnly')}
        </Txt>
      )}

      <SectionTitle>{tr('settings.bookNames')}</SectionTitle>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label={tr('settings.matchTranslation')} selected={settings.bookNames === 'auto'} onPress={() => updateSettings({ bookNames: 'auto' })} />
        {LANGUAGES.map((l) => (
          <Chip key={l.code} label={l.name} selected={settings.bookNames === l.code} onPress={() => updateSettings({ bookNames: l.code })} />
        ))}
      </Row>

      <SectionTitle>{tr('read.textSize')}</SectionTitle>
      <Row>
        <IconButton icon="remove-circle-outline" size={30} label={tr('read.smaller')} onPress={() => updateSettings({ fontSize: Math.max(13, settings.fontSize - 1) })} />
        <Txt variant="heading">{settings.fontSize}</Txt>
        <IconButton icon="add-circle-outline" size={30} label={tr('read.bigger')} onPress={() => updateSettings({ fontSize: Math.min(34, settings.fontSize + 1) })} />
      </Row>

      <SectionTitle>{tr('settings.about')}</SectionTitle>
      <Card style={{ gap: 6 }}>
        <Txt variant="label">{tr('settings.version', { v: '0.5' })}</Txt>
        <Txt variant="small" muted>
          {tr('settings.verse')}
        </Txt>
      </Card>
    </Screen>
  );
}

function BibleRow({ x, selected, canManage, signedIn }: { x: Translation; selected: boolean; canManage: boolean; signedIn: boolean }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: tr, locale } = useT();
  const settings = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const status = !x.hub_id ? tr('bibles.localOnly') : x.offline ? tr('bibles.saved') : tr('bibles.streaming');
  const langName = LANGUAGES.find((l) => l.code === x.lang)?.name ?? x.lang;

  const run = async (key: 'bibles.uploading' | 'bibles.saving', fn: (p: Progress) => Promise<void>) => {
    setErr(null);
    setBusy(tr(key, { pct: 0 }));
    try {
      await fn((done, total) => setBusy(tr(key, { pct: Math.round((done / Math.max(1, total)) * 100) })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    try {
      if (x.hub_id && canManage) {
        if (await confirm(tr('bibles.deleteHubTitle', { abbr: x.abbr }), tr('bibles.deleteHubBody'))) await deleteFromHub(db, x.id);
        else return;
      } else if (await confirm(tr('settings.removeBibleTitle', { abbr: x.abbr }), tr('settings.removeBibleBody'))) {
        await deleteTranslation(db, x.id);
      } else return;
      if (settings.translationId === x.id) updateSettings({ translationId: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.row, { borderColor: t.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Pressable onPress={() => updateSettings({ translationId: x.id })}>
          <Row>
            <Txt variant="label">{x.abbr}</Txt>
            {selected && <Ionicons name="checkmark-circle" size={18} color={t.accent} />}
          </Row>
          <Txt variant="small" muted numberOfLines={1}>
            {x.name}
          </Txt>
          <Txt variant="caption" muted>
            {langName} · {tr('bibles.verses', { n: x.verse_count.toLocaleString(locale) })}
            {!x.has_ot ? ` · ${tr('settings.ntOnly')}` : !x.has_nt ? ` · ${tr('settings.otOnly')}` : ''}
          </Txt>
          <Row gap={4}>
            <Ionicons
              name={!x.hub_id ? 'phone-portrait-outline' : x.offline ? 'cloud-done-outline' : 'cloud-outline'}
              size={13}
              color={t.textSecondary}
            />
            <Txt variant="caption" muted>
              {status}
            </Txt>
          </Row>
        </Pressable>
        {busy ? (
          <Txt variant="caption" color={t.accent}>
            {busy}
          </Txt>
        ) : (
          <Row style={{ flexWrap: 'wrap', marginTop: 4 }} gap={6}>
            {!x.hub_id && signedIn && canManage && (
              <Button small kind="ghost" icon="cloud-upload-outline" title={tr('bibles.upload')} onPress={() => run('bibles.uploading', (p) => uploadBible(db, x.id, p))} />
            )}
            {!!x.hub_id && !x.offline && signedIn && (
              <Button small kind="ghost" icon="download-outline" title={tr('bibles.saveOffline')} onPress={() => run('bibles.saving', (p) => saveOffline(db, x.id, p))} />
            )}
            {!!x.hub_id && !!x.offline && (
              <Button
                small
                kind="ghost"
                icon="phone-portrait-outline"
                title={tr('bibles.removeFromDevice')}
                onPress={async () => {
                  if (await confirm(tr('bibles.removeFromDeviceTitle', { abbr: x.abbr }), tr('bibles.removeFromDeviceBody'))) await removeFromDevice(db, x.id);
                }}
              />
            )}
          </Row>
        )}
        {err && (
          <Txt variant="caption" color={t.danger}>
            {err}
          </Txt>
        )}
      </View>
      {(!x.hub_id || canManage) && !busy && (
        <IconButton icon="trash-outline" label={tr('common.remove')} color={t.danger} onPress={remove} />
      )}
    </View>
  );
}

function HubCard() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: tr, tn, locale } = useT();
  const hub = useHub();
  const info = useLive((d) => getSyncInfo(d), [], ['hub', 'reads', 'highlights', 'notes', 'topics', 'bookmarks', 'plans']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!hub)
    return (
      <Card style={{ gap: 8 }}>
        <Txt variant="small" muted>
          {tr('settings.hubNotConnected')}
        </Txt>
        <Button small icon="cloud-outline" title={tr('settings.connect')} onPress={() => router.push('/hub')} style={{ alignSelf: 'flex-start' }} />
      </Card>
    );

  return (
    <Card style={{ gap: 8 }}>
      <Txt variant="label">{hub.user.name}</Txt>
      <Txt variant="small" muted>
        {hub.user.email} · {hub.url}
      </Txt>
      <Txt variant="small" muted>
        {info?.lastSync ? tr('settings.lastSynced', { date: new Date(info.lastSync).toLocaleString(locale) }) : tr('settings.notSynced')}
        {info?.pending ? ` · ${tn('settings.pending', info.pending)}` : ''}
      </Txt>
      {err && (
        <Txt variant="small" color={t.danger}>
          {err}
        </Txt>
      )}
      <Row>
        <Button
          small
          icon="sync"
          title={tr('settings.syncNow')}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setErr(null);
            try {
              await syncNow(db);
              await updateChallengeProgress(db);
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          small
          kind="ghost"
          icon="log-out-outline"
          title={tr('settings.signOut')}
          onPress={async () => {
            if (await confirm(tr('settings.signOutTitle'), tr('settings.signOutBody'))) {
              await resetSyncState(db);
              await forgetStreamingBibles(db);
              signOut();
            }
          }}
        />
      </Row>
    </Card>
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
