import type { Voice } from 'expo-speech';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, IconButton, Ionicons, Row, Sheet, Txt } from '@/components/ui';
import { ReaderMaxWidth } from '@/constants/theme';
import { narrator, voicesFor, SPEECH_LANG } from '@/hooks/use-read-aloud';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { updateSettings, useSettings } from '@/lib/settings';

const SPEEDS = [0.75, 1, 1.25, 1.5];

/** The read-aloud player under the reader: verse, back / play-pause / forward, speed and voice. */
export function ListenBar({
  label,
  playing,
  verse,
  lang,
  bottomInset,
}: {
  /** e.g. "John 3" */
  label: string;
  playing: boolean;
  verse: number | null;
  lang: keyof typeof SPEECH_LANG;
  bottomInset: number;
}) {
  const t = useTheme();
  const { t: L } = useT();
  const settings = useSettings();
  const [sheet, setSheet] = useState(false);
  const rate = settings.ttsRate;
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] ?? 1;

  return (
    <View style={[styles.bar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: 10 + bottomInset }]}>
      <Row style={styles.inner} gap={4}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" numberOfLines={1}>
            {label}
            {verse != null ? `:${verse}` : ''}
          </Txt>
          <Row gap={6}>
            {playing && verse == null && <ActivityIndicator size="small" color={t.textSecondary} />}
            <Txt variant="caption" muted numberOfLines={1}>
              {playing ? (verse == null ? L('listen.loading') : L('listen.reading')) : L('listen.paused')}
            </Txt>
          </Row>
        </View>
        <IconButton icon="play-skip-back" label={L('listen.prev')} onPress={() => narrator.skip(-1)} />
        <Pressable
          onPress={() => (playing ? narrator.pause() : narrator.resume())}
          accessibilityRole="button"
          accessibilityLabel={playing ? L('listen.pause') : L('listen.play')}
          style={({ pressed }) => [styles.play, { backgroundColor: t.ink, opacity: pressed ? 0.8 : 1 }]}>
          <Ionicons name={playing ? 'pause' : 'play'} size={26} color={t.onInk} style={!playing && { marginLeft: 3 }} />
        </Pressable>
        <IconButton icon="play-skip-forward" label={L('listen.next')} onPress={() => narrator.skip(1)} />
        <Pressable
          onPress={() => updateSettings({ ttsRate: nextSpeed })}
          accessibilityRole="button"
          accessibilityLabel={`${L('listen.speed')} ${rate}×`}
          style={({ pressed }) => [styles.speed, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
          <Txt variant="small" style={{ fontWeight: '700' }}>
            {rate}×
          </Txt>
        </Pressable>
        <IconButton icon="options-outline" label={L('listen.voice')} onPress={() => setSheet(true)} />
        <IconButton icon="close" label={L('listen.close')} onPress={() => narrator.close()} />
      </Row>
      <VoiceSheet visible={sheet} onClose={() => setSheet(false)} lang={lang} />
    </View>
  );
}

function VoiceSheet({ visible, onClose, lang }: { visible: boolean; onClose: () => void; lang: keyof typeof SPEECH_LANG }) {
  const t = useTheme();
  const { t: L } = useT();
  const settings = useSettings();
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const chosen = settings.ttsVoices[lang];

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    voicesFor(lang)
      .then((v) => alive && setVoices(v))
      .catch(() => alive && setVoices([]));
    return () => {
      alive = false;
    };
  }, [visible, lang]);

  const pick = (id: string | undefined) => updateSettings({ ttsVoices: { ...settings.ttsVoices, [lang]: id } });

  return (
    <Sheet visible={visible} onClose={onClose} title={L('listen.title')}>
      <Txt variant="label" style={{ marginBottom: 8 }}>
        {L('listen.speed')}
      </Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        {SPEEDS.map((s) => (
          <Chip key={s} label={`${s}×`} selected={settings.ttsRate === s} onPress={() => updateSettings({ ttsRate: s })} />
        ))}
      </Row>

      <Txt variant="label" style={{ marginTop: 18, marginBottom: 4 }}>
        {L('listen.voice')}
      </Txt>
      <ScrollView style={{ maxHeight: 320 }}>
        <VoiceRow name={L('listen.default')} selected={!chosen} onPress={() => pick(undefined)} />
        {voices === null ? (
          <ActivityIndicator style={{ marginVertical: 16 }} color={t.textSecondary} />
        ) : (
          voices.map((v) => (
            <VoiceRow
              key={v.identifier}
              name={v.name}
              detail={`${v.language}${v.quality === 'Enhanced' ? ` · ${L('listen.enhanced')}` : ''}`}
              selected={chosen === v.identifier}
              onPress={() => pick(v.identifier)}
            />
          ))
        )}
        {voices?.length === 0 && (
          <Txt variant="small" muted style={{ marginTop: 8 }}>
            {L('listen.noVoices')}
          </Txt>
        )}
      </ScrollView>
      <Txt variant="small" muted style={{ marginTop: 12 }}>
        {L('listen.hint')}
      </Txt>
    </Sheet>
  );
}

function VoiceRow({ name, detail, selected, onPress }: { name: string; detail?: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.voiceRow, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Txt variant="label" numberOfLines={1}>
          {name}
        </Txt>
        {detail && (
          <Txt variant="small" muted numberOfLines={1}>
            {detail}
          </Txt>
        )}
      </View>
      {selected && <Ionicons name="checkmark-circle" size={22} color={t.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10 },
  inner: { width: '100%', maxWidth: ReaderMaxWidth + 80, alignSelf: 'center' },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  speed: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 4 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
