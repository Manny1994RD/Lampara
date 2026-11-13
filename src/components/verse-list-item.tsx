import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Card, Row, Txt, highlightBg } from '@/components/ui';
import type { HighlightColor } from '@/constants/theme';
import { refLabel, type Lang } from '@/data/books';
import { useTheme } from '@/hooks/use-theme';
import { updateSettings } from '@/lib/settings';

/** A verse card used in My Verses, topic pages and search results. Tap to open it in the reader. */
export function VerseListItem({
  book,
  ch,
  v,
  text,
  lang,
  color,
  extra,
  right,
}: {
  book: number;
  ch: number;
  v: number;
  text?: string;
  lang: Lang;
  color?: HighlightColor | null;
  extra?: ReactNode;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Card
      onPress={() => {
        updateSettings({ book, chapter: ch });
        router.navigate('/read');
      }}
      style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          {color && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: highlightBg(color, t.dark) }} />}
          <Txt variant="label" color={t.accent}>
            {refLabel(book, ch, v, lang)}
          </Txt>
        </Row>
        {right}
      </Row>
      {text ? (
        <Txt variant="serif" style={{ fontSize: 16, lineHeight: 24 }} numberOfLines={4}>
          {text}
        </Txt>
      ) : null}
      {extra}
    </Card>
  );
}
