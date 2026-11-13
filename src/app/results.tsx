import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions, type HostInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Button, Chip, IconButton, Ionicons, Row, Screen, Txt } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { bookName } from '@/data/books';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT, type TKey } from '@/i18n';
import { useHub } from '@/lib/hub';
import { getPeriodResults, type Period } from '@/lib/results';
import { getVotd } from '@/lib/votd';

/** Card size in points; captured at 3x → 1080 × 1920 (perfect for WhatsApp status / stories). */
const CARD_W = 360;
const CARD_H = 640;
const FLAME = '#FF7A33';

export default function ResultsScreen() {
  const t = useTheme();
  const { t: tr, date } = useT();
  const { current, lang } = useTranslations();
  const hub = useHub();
  const [period, setPeriod] = useState<Period>('week');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cardRef = useRef<HostInstance>(null);
  const { width } = useWindowDimensions();

  const data = useLive((db) => getPeriodResults(db, period), [period], ['reads', 'highlights', 'notes']);
  const votd = useLive((db) => getVotd(db, current?.id ?? null, lang), [current?.id, lang], ['translations']);

  // Scale the card down to fit narrow screens (the shared image is always full size).
  const scale = Math.min(1, (width - 32) / CARD_W);

  const share = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    setMsg(null);
    try {
      if (Platform.OS === 'web') {
        const dataUri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'data-uri' });
        const blob = await (await fetch(dataUri)).blob();
        const file = new File([blob], 'lampara-results.png', { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        if (nav.share && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file] });
        } else {
          // Fallback: download the image.
          const a = document.createElement('a');
          a.href = dataUri;
          a.download = 'lampara-results.png';
          a.click();
        }
      } else {
        const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: CARD_W * 3, height: CARD_H * 3, result: 'tmpfile' });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: tr('results.share') });
        else setMsg(tr('results.shareFailed'));
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) setMsg(tr('results.shareFailed'));
    } finally {
      setBusy(false);
    }
  };

  const rangeLabel =
    !data
      ? ''
      : data.start === data.end
        ? date(data.start, { weekday: 'long', month: 'long', day: 'numeric' })
        : `${date(data.start, { month: 'short', day: 'numeric' })} – ${date(data.end, { month: 'short', day: 'numeric' })}`;
  const maxBar = Math.max(1, ...(data?.perDay.map((d) => d.n) ?? [1]));

  return (
    <Screen maxWidth={520}>
      <Row>
        <IconButton icon="chevron-back" label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          {tr('results.title')}
        </Txt>
      </Row>

      <Row style={{ marginVertical: 12, justifyContent: 'center' }}>
        {(['day', 'week', 'month'] as Period[]).map((p) => (
          <Chip key={p} label={tr(`results.${p}` as TKey)} selected={period === p} onPress={() => setPeriod(p)} />
        ))}
      </Row>

      {/* The card that becomes the image */}
      <View style={{ alignItems: 'center', height: CARD_H * scale }}>
        <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale }], transformOrigin: 'top center' }}>
          <View ref={cardRef} collapsable={false} style={styles.card}>
            <LinearGradient colors={['#2A1609', '#120C08', '#0B0B0C']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
            <View style={[styles.glow]} />

            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={6}>
                <Ionicons name="flame" size={22} color={FLAME} />
                <Text style={styles.brand}>Lámpara</Text>
              </Row>
              <Text style={styles.range}>{rangeLabel}</Text>
            </Row>

            <View style={{ marginTop: 26 }}>
              {hub?.user.name ? <Text style={styles.name}>{hub.user.name}</Text> : null}
              <Text style={styles.headline}>{tr(`results.headline.${period}` as TKey)}</Text>
            </View>

            <View style={{ marginTop: 22 }}>
              <Text style={styles.bigNumber}>{data?.chapters ?? 0}</Text>
              <Text style={styles.bigLabel}>{tr('results.chapters')}</Text>
            </View>

            {/* chapters per day */}
            {period !== 'day' && data && (
              <View style={styles.bars}>
                {data.perDay.map((d) => (
                  <View key={d.day} style={styles.barSlot}>
                    <View
                      style={{
                        height: Math.max(3, (d.n / maxBar) * 56),
                        borderRadius: 3,
                        backgroundColor: d.n ? FLAME : 'rgba(255,255,255,0.12)',
                      }}
                    />
                  </View>
                ))}
              </View>
            )}

            <View style={styles.grid}>
              <Stat value={data?.daysRead ?? 0} label={tr('results.daysRead')} />
              <Stat value={data?.streak ?? 0} label={tr('results.streak')} icon="flame" />
              <Stat value={data?.highlights ?? 0} label={tr('results.highlights')} />
              <Stat value={`${((data?.biblePct ?? 0) * 100).toFixed(1)}%`} label={tr('results.bibleProgress')} />
            </View>

            {data && data.books.length > 0 ? (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.smallLabel}>{tr('results.books')}</Text>
                <Text style={styles.books} numberOfLines={2}>
                  {data.books
                    .slice(0, 4)
                    .map((b) => bookName(b, lang))
                    .join(' · ')}
                  {data.books.length > 4 ? ` +${data.books.length - 4}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={[styles.books, { marginTop: 16, opacity: 0.7 }]}>{tr('results.noReading')}</Text>
            )}

            <View style={{ flex: 1 }} />

            {votd?.text ? (
              <View style={styles.verseBox}>
                <Text style={styles.verse} numberOfLines={4}>
                  “{votd.text}”
                </Text>
                <Text style={styles.verseRef}>
                  {votd.label}
                  {current ? ` · ${current.abbr}` : ''}
                </Text>
              </View>
            ) : null}

            <Text style={styles.footer}>{tr('results.footer')}</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 8, marginTop: 18 }}>
        <Button icon="share-social" title={tr('results.share')} loading={busy} onPress={share} />
        <Txt variant="small" muted style={{ textAlign: 'center' }}>
          {tr('results.hint')}
        </Txt>
        {msg && (
          <Txt variant="small" color={t.danger} style={{ textAlign: 'center' }}>
            {msg}
          </Txt>
        )}
      </View>
    </Screen>
  );
}

function Stat({ value, label, icon }: { value: number | string; label: string; icon?: 'flame' }) {
  return (
    <View style={styles.stat}>
      <Row gap={4}>
        {icon && <Ionicons name={icon} size={16} color={FLAME} />}
        <Text style={styles.statValue}>{value}</Text>
      </Row>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, borderRadius: 28, overflow: 'hidden', padding: 26, backgroundColor: '#0B0B0C' },
  glow: { position: 'absolute', top: -120, right: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(255,122,51,0.16)' },
  brand: { color: '#fff', fontSize: 18, fontWeight: '800', fontFamily: Fonts.sans, letterSpacing: -0.3 },
  range: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', fontFamily: Fonts.sans, textTransform: 'capitalize' },
  name: { color: FLAME, fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans, marginBottom: 4 },
  headline: { color: '#fff', fontSize: 28, lineHeight: 33, fontWeight: '800', fontFamily: Fonts.sans, letterSpacing: -0.6 },
  bigNumber: { color: '#fff', fontSize: 84, lineHeight: 88, fontWeight: '800', fontFamily: Fonts.sans, letterSpacing: -3 },
  bigLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600', fontFamily: Fonts.sans },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60, marginTop: 14 },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  stat: { width: '47%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 12 },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '800', fontFamily: Fonts.sans },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', fontFamily: Fonts.sans, marginTop: 2 },
  smallLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', fontFamily: Fonts.sans, textTransform: 'uppercase', letterSpacing: 0.8 },
  books: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: Fonts.sans, marginTop: 4 },
  verseBox: { borderLeftWidth: 3, borderLeftColor: FLAME, paddingLeft: 12, marginBottom: 14 },
  verse: { color: '#fff', fontSize: 15, lineHeight: 22, fontFamily: Fonts.serif },
  verseRef: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', fontFamily: Fonts.sans, marginTop: 6 },
  footer: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600', fontFamily: Fonts.sans, textAlign: 'center', letterSpacing: 0.5 },
});
