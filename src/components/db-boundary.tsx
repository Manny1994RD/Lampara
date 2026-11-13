import { Component, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { getT } from '@/i18n';

/**
 * Catches database start-up errors. On the web the database can only be open in one tab at a time,
 * and right after a reload the previous page may still be holding it for a moment — so we retry
 * a few times before showing a message.
 */
export class DatabaseBoundary extends Component<
  { children: (attempt: number) => ReactNode; colors: { background: string; text: string; accent: string } },
  { attempt: number; failed: Error | null }
> {
  state = { attempt: 0, failed: null as Error | null };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error) {
    return { failed: error };
  }

  componentDidCatch() {
    if (this.state.attempt < 6) {
      this.timer = setTimeout(() => this.setState((s) => ({ attempt: s.attempt + 1, failed: null })), 700);
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    const { failed, attempt } = this.state;
    const c = this.props.colors;
    if (failed && attempt >= 6) {
      const locked = /access handle|locked|another open/i.test(failed.message);
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: c.background }}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
            {locked && Platform.OS === 'web' ? getT().t('db.otherTab') : getT().t('db.cantOpen')}
          </Text>
          <Text style={{ color: c.text, opacity: 0.7, textAlign: 'center', maxWidth: 420 }}>
            {locked && Platform.OS === 'web'
              ? getT().t('db.otherTabHint')
              : failed.message}
          </Text>
          <Pressable
            onPress={() => this.setState({ attempt: 0, failed: null })}
            style={{ backgroundColor: c.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{getT().t('db.tryAgain')}</Text>
          </Pressable>
        </View>
      );
    }
    if (failed) return <View style={{ flex: 1, backgroundColor: c.background }} />;
    return this.props.children(attempt);
  }
}
