import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { localDay } from '@/lib/db';

/** GitHub-style calendar of reading days (last N weeks). */
export function ReadingHeatmap({
  days,
  weeks = 18,
  grace,
}: {
  days: Map<string, number>;
  weeks?: number;
  /** Missed days covered by a grace day (drawn with an outline). */
  grace?: Set<string>;
}) {
  const t = useTheme();
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1) - today.getDay());

  const cols: { day: string; count: number; future: boolean }[][] = [];
  const d = new Date(start);
  for (let w = 0; w < weeks + 1; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const key = localDay(d);
      col.push({ day: key, count: days.get(key) ?? 0, future: d > today });
      d.setDate(d.getDate() + 1);
    }
    cols.push(col);
  }

  const shade = (n: number) => {
    if (n === 0) return t.cardAlt;
    const alpha = n >= 4 ? 'FF' : n === 3 ? 'CC' : n === 2 ? '99' : '66';
    return t.accent + alpha;
  };

  return (
    <View>
      <View style={styles.grid}>
        {cols.map((col, ci) => (
          <View key={ci} style={styles.col}>
            {col.map((c) => (
              <View
                key={c.day}
                accessibilityLabel={`${c.day}: ${c.count} chapters`}
                style={[
                  styles.cell,
                  { backgroundColor: c.future ? 'transparent' : shade(c.count) },
                  grace?.has(c.day) && { borderWidth: 2, borderColor: t.accent },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={[styles.legend]}>
        <Txt variant="caption" muted>
          Less
        </Txt>
        {[0, 1, 2, 3, 4].map((n) => (
          <View key={n} style={[styles.cell, { backgroundColor: shade(n) }]} />
        ))}
        <Txt variant="caption" muted>
          More
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 3, flexWrap: 'nowrap', overflow: 'hidden' },
  col: { gap: 3 },
  cell: { width: 13, height: 13, borderRadius: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-end' },
});
