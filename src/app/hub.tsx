import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, IconButton, Row, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { signIn, signUp, useHub } from '@/lib/hub';
import { markAllForUpload, syncNow } from '@/lib/sync';

/** Connect to your hub: sign in, or join with an invite code. */
export default function HubScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const hub = useHub();
  const [mode, setMode] = useState<'signin' | 'join'>('signin');
  const [url, setUrl] = useState(hub?.url ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/friends'));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(url, email, password);
      else await signUp(url, name, email, password, invite);
      // Send what's already on this device, then pull what's on the hub.
      await markAllForUpload(db);
      await syncNow(db);
      back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }];
  const canSubmit = url.trim() && email.trim() && password.length >= 8 && (mode === 'signin' || name.trim());

  return (
    <Screen maxWidth={560}>
      <Row>
        <IconButton icon="chevron-back" label="Back" onPress={back} />
        <Txt variant="title" style={{ flex: 1 }}>
          Connect to your hub
        </Txt>
      </Row>
      <Txt muted style={{ marginBottom: 16 }}>
        Your hub is the Lámpara server on your ZimaOS. It keeps your phone, tablet and the website in sync and powers
        challenges with friends. Your Bible files never leave your devices.
      </Txt>

      <Row style={{ marginBottom: 14 }}>
        <Chip label="Sign in" selected={mode === 'signin'} onPress={() => setMode('signin')} />
        <Chip label="Join with an invite" selected={mode === 'join'} onPress={() => setMode('join')} />
      </Row>

      <Card style={{ gap: 10 }}>
        <Txt variant="label">Hub address</Txt>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.50:8090"
          placeholderTextColor={t.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={input}
        />
        {mode === 'join' && (
          <>
            <Txt variant="label">Your name</Txt>
            <TextInput value={name} onChangeText={setName} placeholder="Name your friends will see" placeholderTextColor={t.textSecondary} style={input} />
          </>
        )}
        <Txt variant="label">Email</Txt>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          style={input}
        />
        <Txt variant="label">Password</Txt>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType={mode === 'join' ? 'newPassword' : 'password'}
          placeholder="At least 8 characters"
          placeholderTextColor={t.textSecondary}
          style={input}
        />
        {mode === 'join' && (
          <>
            <Txt variant="label">Invite code</Txt>
            <TextInput
              value={invite}
              onChangeText={(v) => setInvite(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="From the person who invited you"
              placeholderTextColor={t.textSecondary}
              style={input}
            />
            <Txt variant="caption" muted>
              {"The hub owner's very first account doesn't need an invite code."}
            </Txt>
          </>
        )}
        {error && (
          <View style={[styles.error, { borderColor: t.danger }]}>
            <Txt variant="small" color={t.danger}>
              {error}
            </Txt>
          </View>
        )}
        <Button title={mode === 'signin' ? 'Sign in' : 'Create account'} icon="log-in-outline" loading={busy} disabled={!canSubmit} onPress={submit} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  error: { borderWidth: 1, borderRadius: 10, padding: 10 },
});
