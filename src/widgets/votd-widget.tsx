import { Column, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, height, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/** One day's verse, prepared by the app (the widget itself can't read the Bible database). */
export type VotdDay = { day: string; label: string; text: string };
export type VotdWidgetProps = { title: string; days: VotdDay[]; empty: string };

/**
 * Android home-screen widget with the verse of the day.
 * The app sends the next two weeks of verses whenever it opens; the widget shows today's.
 * Runs in the widget's own little runtime: no imports or outside values inside this function.
 */
const VotdWidgetLayout = (props: VotdWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  let today = '';
  try {
    const d = new Date();
    today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    today = '';
  }
  const days = props.days ?? [];
  const v = days.find((x) => x.day === today) ?? days[0];
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#1F1812' : '#F6EEDD';
  const ink = dark ? '#F3E9D8' : '#2B2118';
  const accent = dark ? '#FF8A3D' : '#C2410C';
  return (
    <Column modifiers={[fillMaxSize(), background(bg), cornerRadius(22), paddingAll(16)]}>
      <Text color={accent} style={{ fontSize: 12, fontWeight: '700' }}>
        {`🔥 ${props.title}`}
      </Text>
      <Spacer modifiers={[height(8)]} />
      <Text color={ink} maxLines={7} overflow="ellipsis" style={{ fontSize: 15, fontFamily: 'serif', lineHeight: 21 }}>
        {v ? v.text : props.empty}
      </Text>
      <Spacer modifiers={[height(8)]} />
      <Text color={accent} style={{ fontSize: 12, fontWeight: '700' }}>
        {v ? v.label : ''}
      </Text>
    </Column>
  );
};

export const VotdWidget = createWidget<VotdWidgetProps>('VerseOfTheDay', VotdWidgetLayout, {
  title: 'Verse of the day',
  days: [],
  empty: 'Open Lámpara to load today’s verse.',
});
