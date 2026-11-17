import { Platform, StyleSheet, Text } from 'react-native';

import { highlightBg } from '@/components/ui';
import type { HighlightColor } from '@/constants/theme';
import type { Highlight, Verse } from '@/lib/data';
import { buildSegments } from '@/lib/segments';
import { useSettings } from '@/lib/settings';
import { shiftHighlights } from '@/lib/verse-layout';

export type VerseColors = { text: string; accent: string; dark: boolean };

/**
 * One verse as nested <Text>: number, styled/highlighted runs and little markers.
 * Rendered inside a paragraph <Text> (scroll mode) or on its own (book mode).
 */
export function VerseText({
  verse,
  fontSize,
  colors,
  selected,
  speaking,
  verseColor,
  wordHighlights,
  bookmarked,
  hasNote,
  topicColor,
  onPress,
  onRefPress,
  leadingSpace = true,
}: {
  verse: Verse;
  fontSize: number;
  colors: VerseColors;
  selected: boolean;
  /** Being read aloud right now. */
  speaking?: boolean;
  verseColor: HighlightColor | null;
  wordHighlights: Highlight[];
  bookmarked?: boolean;
  hasNote?: boolean;
  topicColor?: HighlightColor | null;
  onPress: () => void;
  /** Tapping a reference letter like (A): open Estudio for this verse. Without it the letters aren't shown. */
  onRefPress?: () => void;
  leadingSpace?: boolean;
}) {
  const segs = buildSegments(verse.text, verse.marks, shiftHighlights(wordHighlights, verse.cut));
  // Words of Jesus: a deep red that stays readable on paper and in dark mode.
  const red = useSettings().redLetters ? (colors.dark ? '#FF8A80' : '#B3261E') : null;
  // Reference letters (A), [7] from e-Sword Bibles, drawn small at their place in the verse.
  const letters = onRefPress ? verse.marks.filter((m) => m.t === 'f' && m.x) : [];
  const letter = (key: string, x: string) => (
    <Text key={key} onPress={onRefPress} suppressHighlighting accessibilityRole="link" style={[styles.letter, { color: colors.accent, fontSize: fontSize * 0.55 }]}>
      {x}
    </Text>
  );
  return (
    <Text
      onPress={onPress}
      suppressHighlighting
      style={[
        selected && { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: colors.accent },
        speaking && { backgroundColor: colors.dark ? 'rgba(255,138,61,0.22)' : 'rgba(232,89,12,0.13)' },
      ]}>
      {/* Section title on its own line (the paragraph starts here). */}
      {verse.title ? (
        <Text style={{ fontWeight: '700', fontSize: fontSize * 0.92 }}>
          {verse.title}
          {'\n'}
        </Text>
      ) : null}
      <Text style={[styles.verseNum, { color: colors.accent, fontSize: fontSize * 0.62 }]}>
        {leadingSpace && !verse.title ? ' ' : ''}
        {verse.v}
        {' '}
      </Text>
      {segs.map((s, si) => {
        const bg = s.color ?? verseColor;
        const here = letters.filter((m) => m.s === s.start);
        return [
          ...here.map((m, li) => letter(`f${si}-${li}`, m.x!)),
          <Text
            key={si}
            style={[
              bg && { backgroundColor: highlightBg(bg, colors.dark) },
              s.italic && { fontStyle: 'italic' },
              s.bold && { fontWeight: '700' },
              s.red && red ? { color: red } : null,
            ]}>
            {s.text}
          </Text>,
        ];
      })}
      {letters.filter((m) => m.s >= verse.text.length).map((m, li) => letter(`fe${li}`, m.x!))}
      {bookmarked && <Text style={{ color: colors.accent }}> ◆</Text>}
      {hasNote && <Text style={{ color: colors.accent }}> ✎</Text>}
      {topicColor && <Text style={{ color: highlightBg(topicColor, !colors.dark) }}> ●</Text>}
    </Text>
  );
}

const styles = StyleSheet.create({
  verseNum: { fontWeight: '700', fontFamily: Platform.select({ web: 'var(--font-display)', default: undefined }) },
  letter: { fontWeight: '800' },
});
