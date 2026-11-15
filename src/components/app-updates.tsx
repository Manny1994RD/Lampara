import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Platform } from 'react-native';

import { Button, Card, Ionicons, Row, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

/**
 * Settings → Updates (Android / iPhone app only).
 * New versions published with `eas update` download here without installing a new APK.
 * The app also checks by itself every time it opens; this button is for checking right now.
 */
export function AppUpdates() {
  if (Platform.OS === 'web') return null;
  return <UpdatesCard />;
}

function UpdatesCard() {
  const t = useTheme();
  const { t: tr, date } = useT();
  const { currentlyRunning, isUpdatePending } = Updates.useUpdates();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const version = Constants.expoConfig?.version ?? '';
  const runningLine =
    currentlyRunning.isEmbeddedLaunch || !currentlyRunning.createdAt
      ? tr('updates.builtIn')
      : tr('updates.from', { date: date(currentlyRunning.createdAt.toISOString()) });

  const check = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const found = await Updates.checkForUpdateAsync();
      if (!found.isAvailable) {
        setMessage({ text: tr('updates.upToDate') });
        return;
      }
      // Download it now; the "Restart" button then appears (isUpdatePending).
      await Updates.fetchUpdateAsync();
    } catch {
      setMessage({ text: tr('updates.error'), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 8 }}>
      <Row>
        <Ionicons name="cloud-download-outline" size={20} color={t.accent} />
        <Txt variant="label" style={{ flex: 1 }}>
          {tr('updates.version', { v: version })}
        </Txt>
      </Row>
      <Txt variant="small" muted>
        {runningLine}
      </Txt>
      {!Updates.isEnabled ? (
        <Txt variant="small" muted>
          {tr('updates.unavailable')}
        </Txt>
      ) : isUpdatePending ? (
        <>
          <Txt variant="small">{tr('updates.ready')}</Txt>
          <Button icon="refresh" title={tr('updates.restart')} onPress={() => Updates.reloadAsync().catch(() => undefined)} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : (
        <>
          {message && (
            <Txt variant="small" color={message.error ? t.danger : undefined}>
              {message.text}
            </Txt>
          )}
          <Button small kind="secondary" icon="sync" title={tr('updates.check')} loading={busy} onPress={check} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
    </Card>
  );
}
