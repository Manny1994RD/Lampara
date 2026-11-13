import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AccountForm } from '@/components/account-form';
import { ImportButton } from '@/components/import-button';
import { Button, Card, Ionicons, Row, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { LANGUAGES, useT, type AppLang } from '@/i18n';
import type { Translation } from '@/lib/data';
import { rememberUrl, useHub } from '@/lib/hub';
import { saveOffline } from '@/lib/hub-bibles';
import { getSettings, updateSettings } from '@/lib/settings';

type Step = 'lang' | 'account' | 'bible';

/**
 * First start: choose a language → accept your invitation or sign in → choose a Bible → read.
 * Also opened from an invitation link (/join?code=…) and from "Choose a Bible".
 */
export default function WelcomeScreen() {
  const params = useLocalSearchParams<{ code?: string; hub?: string; step?: string }>();
  const hub = useHub();
  const t = useTheme();
  const { t: tr } = useT();
  const [step, setStep] = useState<Step>(() => {
    // An invitation link can carry the server address, so nobody has to type it.
    if (params.hub) rememberUrl(String(params.hub));
    if (params.step === 'bible') return 'bible';
    if (params.code) return hub ? 'bible' : 'account';
    return 'lang';
  });

  const finish = () => {
    updateSettings({ onboarded: true });
    router.replace('/read');
  };

  return (
    <Screen maxWidth={560}>
      <Row style={{ marginTop: 12, marginBottom: 8 }}>
        <Ionicons name="flame" size={30} color={t.accent} />
        <Txt variant="title" style={{ fontSize: 30 }}>
          Lámpara
        </Txt>
      </Row>
      <Steps step={step} />

      {step === 'lang' && (
        <>
          <Txt variant="heading" style={{ marginTop: 18 }}>
            {tr('welcome.chooseLanguage')}
          </Txt>
          <View style={{ gap: 10, marginTop: 12 }}>
            {(['es', 'en', 'ko'] as AppLang[]).map((code) => (
              <BigButton
                key={code}
                label={LANGUAGES.find((l) => l.code === code)!.name}
                onPress={() => {
                  updateSettings({ appLanguage: code });
                  setStep(hub ? 'bible' : 'account');
                }}
              />
            ))}
          </View>
        </>
      )}

      {step === 'account' && (
        <>
          <Txt variant="heading" style={{ marginTop: 18 }}>
            {tr('welcome.accountTitle')}
          </Txt>
          <Txt muted style={{ marginTop: 4, marginBottom: 14 }}>
            {tr('welcome.accountBody')}
          </Txt>
          <AccountForm initialMode="join" initialCode={params.code ? String(params.code) : ''} onDone={() => setStep('bible')} />
          <Button
            kind="ghost"
            small
            title={tr('welcome.noAccount')}
            onPress={() => setStep('bible')}
            style={{ marginTop: 12, alignSelf: 'center' }}
          />
        </>
      )}

      {step === 'bible' && <ChooseBible onDone={finish} />}
    </Screen>
  );
}

function Steps({ step }: { step: Step }) {
  const t = useTheme();
  const order: Step[] = ['lang', 'account', 'bible'];
  const at = order.indexOf(step);
  return (
    <Row gap={6} style={{ marginTop: 4 }}>
      {order.map((s, i) => (
        <View key={s} style={[styles.dot, { backgroundColor: i <= at ? t.accent : t.border, flex: 1 }]} />
      ))}
    </Row>
  );
}

function BigButton({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.big, { borderColor: t.border, backgroundColor: t.card, opacity: pressed ? 0.8 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Txt variant="heading">{label}</Txt>
        {sub && (
          <Txt variant="small" muted>
            {sub}
          </Txt>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
    </Pressable>
  );
}

/** Pick the Bible to read: the church library (from the hub) and the ones already on this device. */
function ChooseBible({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const { t: tr, lang: appLang } = useT();
  const hub = useHub();
  const { list, current } = useTranslations();
  const [picked, setPicked] = useState<string | null>(getSettings().translationId ?? current?.id ?? null);

  // The app's language first, then the others.
  const sorted = [...(list ?? [])].sort((a, b) =>
    a.lang === b.lang ? a.abbr.localeCompare(b.abbr) : a.lang === appLang ? -1 : b.lang === appLang ? 1 : a.lang.localeCompare(b.lang)
  );
  const chosen = sorted.find((x) => x.id === picked) ?? null;

  return (
    <>
      <Txt variant="heading" style={{ marginTop: 18 }}>
        {tr('welcome.bibleTitle')}
      </Txt>
      <Txt muted style={{ marginTop: 4, marginBottom: 12 }}>
        {hub ? tr('welcome.bibleBodyHub') : tr('welcome.bibleBodyLocal')}
      </Txt>
      {list && list.length === 0 && (
        <Card style={{ gap: 10, marginBottom: 12 }}>
          <Txt>{hub ? tr('welcome.noBiblesHub') : tr('welcome.noBiblesLocal')}</Txt>
          <ImportButton />
        </Card>
      )}
      <View style={{ gap: 8 }}>
        {sorted.map((x) => (
          <BibleChoice key={x.id} x={x} selected={x.id === picked} onPress={() => setPicked(x.id)} />
        ))}
      </View>
      <Button
        title={tr('welcome.start')}
        icon="book-outline"
        disabled={!chosen}
        style={{ marginTop: 16 }}
        onPress={() => {
          if (chosen) updateSettings({ translationId: chosen.id, defaultBible: chosen.id });
          onDone();
        }}
      />
      {!list?.length && (
        <Button kind="ghost" small title={tr('welcome.later')} style={{ marginTop: 8, alignSelf: 'center' }} onPress={onDone} />
      )}
      <Txt variant="caption" muted style={{ marginTop: 10, textAlign: 'center', color: t.textSecondary }}>
        {tr('welcome.changeLater')}
      </Txt>
    </>
  );
}

function BibleChoice({ x, selected, onPress }: { x: Translation; selected: boolean; onPress: () => void }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { t: tr } = useT();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const onDevice = !x.hub_id || !!x.offline;
  const langName = LANGUAGES.find((l) => l.code === x.lang)?.name ?? x.lang;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.bible,
        { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.accentSoft : t.card, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          <Txt variant="label">{x.abbr}</Txt>
          <Txt variant="caption" muted>
            {langName}
          </Txt>
        </Row>
        <Txt variant="small" muted numberOfLines={1}>
          {x.name}
        </Txt>
        <Row gap={4}>
          <Ionicons name={onDevice ? 'checkmark-circle' : 'cloud-outline'} size={13} color={onDevice ? t.success : t.textSecondary} />
          <Txt variant="caption" color={onDevice ? t.success : t.textSecondary}>
            {busy != null ? tr('bibles.saving', { pct: busy }) : onDevice ? tr('library.onDevice') : tr('library.available')}
          </Txt>
        </Row>
        {err && (
          <Txt variant="caption" color={t.danger}>
            {err}
          </Txt>
        )}
      </View>
      {!onDevice && busy == null && (
        <Button
          small
          kind="secondary"
          icon="download-outline"
          title={tr('library.download')}
          onPress={async () => {
            setErr(null);
            setBusy(0);
            try {
              await saveOffline(db, x.id, (d, total) => setBusy(Math.round((d / Math.max(1, total)) * 100)));
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(null);
            }
          }}
        />
      )}
      {selected && <Ionicons name="radio-button-on" size={22} color={t.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: { height: 4, borderRadius: 2 },
  big: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16 },
  bible: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12 },
});
