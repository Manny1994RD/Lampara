import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Ionicons, Row, Txt, type IconName } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { defaultHubUrl, resetPassword, signIn, signUp } from '@/lib/hub';
import { refreshHubBibles } from '@/lib/hub-bibles';
import { markAllForUpload, syncNow } from '@/lib/sync';

export type AccountMode = 'join' | 'signin' | 'reset';

/**
 * Sign in, accept an invitation, or reset a forgotten password.
 * The server address stays out of the way when it's already known (website, invitation link, used before).
 */
export function AccountForm({
  initialMode = 'signin',
  initialCode = '',
  initialUrl,
  onDone,
}: {
  initialMode?: AccountMode;
  initialCode?: string;
  initialUrl?: string;
  onDone: () => void;
}) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: tr } = useT();
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [url, setUrl] = useState(initialUrl || defaultHubUrl());
  const knownUrl = !!(initialUrl || defaultHubUrl());
  const [showUrl, setShowUrl] = useState(!knownUrl);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(url, email, password);
      else if (mode === 'join') await signUp(url, name, email, password, code);
      else await resetPassword(url, email, code, password);
      // Send what's already on this device, then bring in what's on the hub.
      await markAllForUpload(db);
      await refreshHubBibles(db).catch(() => undefined);
      await syncNow(db).catch(() => undefined);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }];
  const canSubmit =
    url.trim() &&
    email.trim() &&
    password.length >= 8 &&
    (mode !== 'join' || (name.trim() && code.trim())) &&
    (mode !== 'reset' || code.trim());

  const choice = (m: AccountMode, icon: IconName, label: string) => (
    <Pressable
      onPress={() => {
        setMode(m);
        setError(null);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: mode === m }}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: mode === m ? t.accent : t.border, backgroundColor: mode === m ? t.accentSoft : t.card, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Ionicons name={icon} size={22} color={mode === m ? t.accent : t.text} />
      <Txt variant="label" style={{ flex: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );

  return (
    <View style={{ gap: 12 }}>
      {mode !== 'reset' && (
        <View style={{ gap: 8 }}>
          {choice('join', 'mail-open-outline', tr('account.haveInvite'))}
          {choice('signin', 'person-circle-outline', tr('account.haveAccount'))}
        </View>
      )}

      <Card style={{ gap: 10 }}>
        {mode === 'reset' && (
          <>
            <Txt variant="heading">{tr('account.resetTitle')}</Txt>
            <Txt variant="small" muted>
              {tr('account.resetHint')}
            </Txt>
          </>
        )}
        {mode === 'join' && (
          <>
            <Txt variant="label">{tr('hub.invite')}</Txt>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={tr('hub.invitePlaceholder')}
              placeholderTextColor={t.textSecondary}
              style={input}
            />
            <Txt variant="label">{tr('hub.yourName')}</Txt>
            <TextInput value={name} onChangeText={setName} placeholder={tr('hub.namePlaceholder')} placeholderTextColor={t.textSecondary} style={input} />
          </>
        )}
        <Txt variant="label">{tr('hub.email')}</Txt>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          style={input}
        />
        {mode === 'reset' && (
          <>
            <Txt variant="label">{tr('account.resetCode')}</Txt>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              style={input}
            />
          </>
        )}
        <Txt variant="label">{mode === 'reset' ? tr('account.newPassword') : tr('hub.password')}</Txt>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
          placeholder={tr('hub.passwordHint')}
          placeholderTextColor={t.textSecondary}
          style={input}
          onSubmitEditing={() => canSubmit && !busy && submit()}
        />

        {showUrl ? (
          <>
            <Txt variant="label">{tr('account.server')}</Txt>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://…"
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={input}
            />
            <Txt variant="caption" muted>
              {tr('account.serverHint')}
            </Txt>
          </>
        ) : null}

        {error && (
          <View style={[styles.error, { borderColor: t.danger }]}>
            <Ionicons name="alert-circle-outline" size={18} color={t.danger} />
            <Txt variant="small" color={t.danger} style={{ flex: 1 }}>
              {error}
            </Txt>
          </View>
        )}
        <Button
          title={mode === 'signin' ? tr('hub.signIn') : mode === 'join' ? tr('account.join') : tr('account.resetButton')}
          icon={mode === 'join' ? 'person-add-outline' : mode === 'reset' ? 'key-outline' : 'log-in-outline'}
          loading={busy}
          disabled={!canSubmit}
          onPress={submit}
        />

        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {mode === 'signin' && (
            <Button small kind="ghost" title={tr('account.forgot')} onPress={() => { setMode('reset'); setCode(''); setError(null); }} />
          )}
          {mode === 'reset' && (
            <Button small kind="ghost" icon="chevron-back" title={tr('common.back')} onPress={() => { setMode('signin'); setCode(''); setError(null); }} />
          )}
          {!showUrl && (
            <Button small kind="ghost" icon="settings-outline" title={tr('account.advanced')} onPress={() => setShowUrl(true)} />
          )}
        </Row>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
});
