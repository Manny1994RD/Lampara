import { Platform, StyleSheet, Text } from 'react-native';

import { highlightBg } from '@/components/ui';
import type { HighlightColor } from '@/constants/theme';
import type { Highlight, Verse } from '@/lib/data';
import { buildSegments } from '@/lib/segments';

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
  verseColor,
  wordHighlights,
  bookmarked,
  hasNote,
  topicColor,
  onPress,
  leadingSpace = true,
}: {
  verse: Verse;
  fontSize: number;
  colors: VerseColors;
  selected: boolean;
  verseColor: HighlightColor | null;
  wordHighlights: Highlight[];
  bookmarked?: boolean;
  hasNote?: boolean;
  topicColor?: HighlightColor | null;
  onPress: () => void;
  leadingSpace?: boolean;
}) {
  const segs = buildSegments(verse.text, verse.marks, wordHighlights);
  return (
    <Text
      onPress={onPress}
      suppressHighlighting
      style={selected && { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: colors.accent }}>
      <Text style={[styles.verseNum, { color: colors.accent, fontSize: fontSize * 0.62 }]}>
        {leadingSpace ? ' ' : ''}
        {verse.v}
        {' '}
      </Text>
      {segs.map((s, si) => {
        const bg = s.color ?? verseColor;
        return (
          <Text
            key={si}
            style={[
              bg && { backgroundColor: highlightBg(bg, colors.dark) },
              s.italic && { fontStyle: 'italic' },
              s.bold && { fontWeight: '700' },
            ]}>
            {s.text}
          </Text>
        );
      })}
      {bookmarked && <Text style={{ color: colors.accent }}> ◆</Text>}
      {hasNote && <Text style={{ color: colors.accent }}> ✎</Text>}
      {topicColor && <Text style={{ color: highlightBg(topicColor, !colors.dark) }}> ●</Text>}
    </Text>
  );
}

const styles = StyleSheet.create({
  verseNum: { fontWeight: '700', fontFamily: Platform.select({ web: 'var(--font-display)', default: undefined }) },
});
