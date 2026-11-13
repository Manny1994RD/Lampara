import type { Voice } from 'expo-speech';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Chip, IconButton, Ionicons, Row, Sheet, Txt } from '@/components/ui';
import { narrator, voicesFor, SPEECH_LANG } from '@/hooks/use-read-aloud';
import { DEFAULT_NATURAL, NATURAL_VOICES } from '@/lib/hub-voice';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { updateSettings, useSettings } from '@/lib/settings';

const SPEEDS = [0.75, 1, 1.25, 1.5];

/** The read-aloud player: floats over the reader and can be shrunk to a small button. */
export function ListenBar({
  label,
  playing,
  verse,
  lang,
  engine,
  fellBack,
  naturalOk,
  sleepUntil,
  sleepAtChapterEnd,
  bottom,
}: {
  /** e.g. "John 3" */
  label: string;
  playing: boolean;
  verse: number | null;
  lang: keyof typeof SPEECH_LANG;
  /** Voice actually reading now. */
  engine: 'natural' | 'device';
  fellBack: boolean;
  /** The hub's natural voices are available. */
  naturalOk: boolean;
  sleepUntil: number | null;
  sleepAtChapterEnd: boolean;
  /** Distance from the bottom of the reader. */
  bottom: number;
}) {
  const t = useTheme();
  const { t: L } = useT();
  const settings = useSettings();
  const [sheet, setSheet] = useState(false);
  const rate = settings.ttsRate;
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] ?? 1;
  const minutesLeft = useMinutesLeft(sleepUntil);
  const mini = settings.listenMini;
  const where = `${label}${verse != null ? `:${verse}` : ''}`;
  const sleeping = sleepUntil != null || sleepAtChapterEnd;

  const playButton = (size: number) => (
    <Pressable
      onPress={() => (playing ? narrator.pause() : narrator.resume())}
      accessibilityRole="button"
      accessibilityLabel={playing ? L('listen.pause') : L('listen.play')}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: t.ink },
        { opacity: pressed ? 0.8 : 1 },
      ]}>
      {playing && verse == null ? (
        <ActivityIndicator size="small" color={t.onInk} />
      ) : (
        <Ionicons name={playing ? 'pause' : 'play'} size={Math.round(size * 0.52)} color={t.onInk} style={!playing && { marginLeft: 3 }} />
      )}
    </Pressable>
  );

  const sheetEl = (
    <VoiceSheet
      visible={sheet}
      onClose={() => setSheet(false)}
      lang={lang}
      naturalOk={naturalOk}
      sleepUntil={sleepUntil}
      sleepAtChapterEnd={sleepAtChapterEnd}
    />
  );
  const sleepText = sleepAtChapterEnd ? L('listen.sleepChapterShort') : L('listen.sleepLeft', { n: minutesLeft });

  if (mini) {
    return (
      <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
        <View style={[styles.mini, styles.shadow, { backgroundColor: t.card, borderColor: t.border }]}>
          {playButton(40)}
          <Pressable onPress={() => updateSettings({ listenMini: false })} accessibilityLabel={L('listen.expand')} style={styles.miniText}>
            <Txt variant="small" style={{ fontWeight: '700' }} numberOfLines={1}>
              {where}
            </Txt>
            {sleeping && (
              <Txt variant="caption" muted numberOfLines={1}>
                ☾ {sleepText}
              </Txt>
            )}
          </Pressable>
          <IconButton icon="chevron-up" size={20} label={L('listen.expand')} onPress={() => updateSettings({ listenMini: false })} />
        </View>
        {sheetEl}
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View style={[styles.card, styles.shadow, { backgroundColor: t.card, borderColor: t.border }]}>
        <Row gap={4}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label" numberOfLines={1}>
              {where}
            </Txt>
            <Txt variant="caption" muted numberOfLines={1}>
              {playing ? (verse == null ? L('listen.loading') : L('listen.reading')) : L('listen.paused')}
              {' · '}
              {fellBack ? L('listen.fellBack') : engine === 'natural' ? L('listen.natural') : L('listen.device')}
              {sleeping ? ` · ☾ ${sleepText}` : ''}
            </Txt>
          </View>
          <IconButton icon="options-outline" size={20} label={L('listen.voice')} onPress={() => setSheet(true)} />
          <IconButton icon="chevron-down" size={20} label={L('listen.minimize')} onPress={() => updateSettings({ listenMini: true })} />
          <IconButton icon="close" size={20} label={L('listen.close')} onPress={() => narrator.close()} />
        </Row>
        <Row style={{ justifyContent: 'center', marginTop: 6 }} gap={10}>
          <Pressable
            onPress={() => setSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={L('listen.sleep')}
            style={({ pressed }) => [styles.pill, { borderColor: sleeping ? t.accent : t.border, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name={sleeping ? 'moon' : 'moon-outline'} size={15} color={sleeping ? t.accent : t.text} />
          </Pressable>
          <IconButton icon="play-skip-back" label={L('listen.prev')} onPress={() => narrator.skip(-1)} />
          {playButton(50)}
          <IconButton icon="play-skip-forward" label={L('listen.next')} onPress={() => narrator.skip(1)} />
          <Pressable
            onPress={() => updateSettings({ ttsRate: nextSpeed })}
            accessibilityRole="button"
            accessibilityLabel={`${L('listen.speed')} ${rate}×`}
            style={({ pressed }) => [styles.pill, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
            <Txt variant="small" style={{ fontWeight: '700' }}>
              {rate}×
            </Txt>
          </Pressable>
        </Row>
      </View>
      {sheetEl}
    </View>
  );
}

/** Minutes left on the sleep timer (updates every 15 seconds). */
function useMinutesLeft(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [until]);
  return until == null ? 0 : Math.max(1, Math.ceil((until - now) / 60_000));
}

const SLEEP_OPTIONS = [15, 30, 45, 60] as const;

function VoiceSheet({
  visible,
  onClose,
  lang,
  naturalOk,
  sleepUntil,
  sleepAtChapterEnd,
}: {
  visible: boolean;
  onClose: () => void;
  lang: keyof typeof SPEECH_LANG;
  naturalOk: boolean;
  sleepUntil: number | null;
  sleepAtChapterEnd: boolean;
}) {
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
  const natural = settings.ttsEngine === 'natural';
  const naturalVoice = settings.ttsNatural[lang] ?? DEFAULT_NATURAL[lang];
  const voiceName = (id: string) => L(id.startsWith('F') ? 'listen.female' : 'listen.male', { n: id.slice(1) });

  return (
    <Sheet visible={visible} onClose={onClose} title={L('listen.title')}>
      <Txt variant="label" style={{ marginBottom: 8 }}>
        {L('listen.sleep')}
      </Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label={L('listen.sleepOff')} selected={sleepUntil == null && !sleepAtChapterEnd} onPress={() => narrator.setSleep(null)} />
        {SLEEP_OPTIONS.map((m) => (
          <Chip key={m} label={L('listen.sleepMin', { n: m })} onPress={() => narrator.setSleep(m)} />
        ))}
        <Chip icon="flag-outline" label={L('listen.sleepChapter')} selected={sleepAtChapterEnd} onPress={() => narrator.setSleep('chapter')} />
      </Row>
      {sleepUntil != null && (
        <Txt variant="small" muted style={{ marginTop: 6 }}>
          {L('listen.sleepStops', { time: new Date(sleepUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })}
        </Txt>
      )}

      <Row style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{L('listen.autoMark')}</Txt>
          <Txt variant="small" muted>
            {L('listen.autoMarkHint')}
          </Txt>
        </View>
        <Switch value={settings.autoMarkListened} onValueChange={(v) => updateSettings({ autoMarkListened: v })} />
      </Row>

      <Txt variant="label" style={{ marginTop: 18, marginBottom: 8 }}>
        {L('listen.speed')}
      </Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        {SPEEDS.map((s) => (
          <Chip key={s} label={`${s}×`} selected={settings.ttsRate === s} onPress={() => updateSettings({ ttsRate: s })} />
        ))}
      </Row>

      <Txt variant="label" style={{ marginTop: 18, marginBottom: 8 }}>
        {L('listen.engine')}
      </Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip icon="sparkles-outline" label={L('listen.natural')} selected={natural} onPress={() => updateSettings({ ttsEngine: 'natural' })} />
        <Chip icon="phone-portrait-outline" label={L('listen.device')} selected={!natural} onPress={() => updateSettings({ ttsEngine: 'device' })} />
      </Row>
      {natural && !naturalOk && (
        <Txt variant="small" color={t.danger} style={{ marginTop: 8 }}>
          {L('listen.naturalOff')}
        </Txt>
      )}

      <Txt variant="label" style={{ marginTop: 18, marginBottom: 4 }}>
        {L('listen.voice')}
      </Txt>
      {natural ? (
        <Row style={{ flexWrap: 'wrap', marginTop: 4 }}>
          {NATURAL_VOICES.map((id) => (
            <Chip
              key={id}
              label={voiceName(id)}
              selected={naturalVoice === id}
              onPress={() => updateSettings({ ttsNatural: { ...settings.ttsNatural, [lang]: id } })}
            />
          ))}
        </Row>
      ) : (
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
      )}
      <Txt variant="small" muted style={{ marginTop: 12 }}>
        {natural ? L('listen.naturalHint') : L('listen.hint')}
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
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  card: { width: '100%', maxWidth: 520, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  mini: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 280,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 5,
    paddingRight: 4,
    paddingVertical: 5,
  },
  miniText: { flexShrink: 1, minWidth: 60 },
  shadow: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 32 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
