import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  ImageBackground,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { Fonts } from '@/constants/theme';
import { getT } from '@/i18n';
import type { Verse } from '@/lib/data';

export type BookColors = {
  base: string;
  text: string;
  muted: string;
  accent: string;
  shade: string;
  texture: number | { uri: string } | null | object;
};

type Props = {
  /** Changes whenever the chapter or translation changes (resets to the first page). */
  chapterKey: string;
  verses: Verse[];
  renderVerse: (v: Verse) => ReactNode;
  title: string;
  fontSize: number;
  colors: BookColors;
  /** Open on the last page (used when turning back from the next chapter). */
  startAtEnd: boolean;
  allowTwoPages: boolean;
  canPrevChapter: boolean;
  canNextChapter: boolean;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  /** Shown under the book (e.g. "mark as read"). */
  bottomBar?: ReactNode;
};

const USE_NATIVE = Platform.OS !== 'web';
const TURN_MS = 520;

export function BookView(props: Props) {
  const { verses, fontSize, colors, chapterKey } = props;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  const spread = props.allowTwoPages && size.w >= 900 && size.w > size.h * 1.15;
  const outer = size.w < 500 ? 8 : 18;
  const pageW = spread ? (size.w - outer * 2) / 2 : Math.min(size.w - outer * 2, 760);
  const pageH = size.h - outer * 2;
  const padX = pageW < 420 ? 22 : 36;
  const padTop = 30;
  const padBottom = 40;
  const contentW = Math.max(100, pageW - padX * 2);
  const contentH = Math.max(100, pageH - padTop - padBottom);
  const lineHeight = Math.round(fontSize * 1.55);

  /* ------------------------------ pagination ------------------------------ */

  const measureKey = `${chapterKey}|${Math.round(contentW)}|${fontSize}|${verses.length}`;
  const heights = useRef<{ key: string; title: number; verses: Map<number, number> }>({ key: '', title: 0, verses: new Map() });
  const [pages, setPages] = useState<{ key: string; list: number[][] }>({ key: '', list: [] });

  const tryPaginate = useCallback(() => {
    const m = heights.current;
    if (m.key !== measureKey || m.verses.size < verses.length || !m.title) return;
    const list: number[][] = [];
    let cur: number[] = [];
    let used = m.title;
    verses.forEach((_, i) => {
      const h = m.verses.get(i) ?? lineHeight;
      if (cur.length > 0 && used + h > contentH) {
        list.push(cur);
        cur = [];
        used = 0;
      }
      cur.push(i);
      used += h;
    });
    if (cur.length || list.length === 0) list.push(cur);
    setPages({ key: measureKey, list });
  }, [measureKey, verses, contentH, lineHeight]);

  const record = (kind: 'title' | number, h: number) => {
    if (heights.current.key !== measureKey) heights.current = { key: measureKey, title: 0, verses: new Map() };
    if (kind === 'title') heights.current.title = h;
    else heights.current.verses.set(kind, h);
    tryPaginate();
  };

  // Re-run when only the page height changed (heights are still valid).
  useEffect(() => {
    tryPaginate();
  }, [contentH, tryPaginate]);

  const ready = pages.key === measureKey;
  const pageList = ready ? pages.list : [];
  const unitCount = spread ? Math.ceil(pageList.length / 2) : pageList.length;

  /* ------------------------------- position ------------------------------- */

  const [pos, setPos] = useState<{ key: string; unit: number }>({ key: '', unit: 0 });
  const posKey = `${chapterKey}|${spread}`;
  const unit =
    pos.key === posKey ? Math.min(pos.unit, Math.max(0, unitCount - 1)) : props.startAtEnd ? Math.max(0, unitCount - 1) : 0;
  const setUnit = (u: number) => setPos({ key: posKey, unit: u });

  /* ------------------------------- turning -------------------------------- */

  const [progress] = useState(() => new Animated.Value(0));
  const [turning, setTurning] = useState<{ dir: 1 | -1 } | null>(null);
  // Mutable gesture bookkeeping shared with event handlers (never read while rendering).
  const [ctl] = useState(() => ({
    busy: false,
    dragDir: null as 1 | -1 | null,
    p: 0,
    api: null as null | {
      canTurn: (dir: 1 | -1) => boolean;
      turn: (dir: 1 | -1) => void;
      finishTurn: (dir: 1 | -1, complete: boolean) => void;
      start: (dir: 1 | -1) => void;
      unitWidth: number;
    },
  }));

  const canTurn = (dir: 1 | -1) => (dir === 1 ? unit < unitCount - 1 : unit > 0);

  const finishTurn = (dir: 1 | -1, complete: boolean) => {
    Animated.timing(progress, {
      toValue: complete ? 1 : 0,
      duration: complete ? TURN_MS * (1 - ctl.p) + 120 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE,
    }).start(() => {
      if (complete) setUnit(unit + dir);
      setTurning(null);
      progress.setValue(0);
      ctl.p = 0;
      ctl.busy = false;
    });
  };

  const turn = (dir: 1 | -1) => {
    if (ctl.busy || !ready) return;
    if (!canTurn(dir)) {
      if (dir === 1 && props.canNextChapter) props.onNextChapter();
      if (dir === -1 && props.canPrevChapter) props.onPrevChapter();
      return;
    }
    patch(ctl, { busy: true, p: 0 });
    setTurning({ dir });
    finishTurn(dir, true);
  };

  // Keep the latest handlers available to the gesture / keyboard listeners.
  useEffect(() => {
    patch(ctl, { api: { canTurn, turn, finishTurn, start: (dir) => setTurning({ dir }), unitWidth: pageW } });
  });

  // Keyboard arrows on the web.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') ctl.api?.turn(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') ctl.api?.turn(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  // Swipe to turn: the page follows your finger.
  const [pan] = useState(() => createPageGesture(ctl, progress));

  /* ------------------------------- rendering ------------------------------ */

  const renderPage = (index: number, side: 'left' | 'right' | 'single') => {
    const idxs = pageList[index];
    const isFirst = index === 0;
    return (
      <PageSheet colors={colors} side={side} width={pageW} height={pageH}>
        <View style={{ paddingHorizontal: padX, paddingTop: padTop, height: pageH - padBottom, overflow: 'hidden' }}>
          {isFirst && idxs && (
            <Text style={[styles.title, { color: colors.text, fontFamily: Fonts.serif, fontSize: fontSize * 1.6 }]}>{props.title}</Text>
          )}
          {idxs?.map((i) => (
            <Text key={verses[i].v} style={[styles.block, { fontSize, lineHeight, color: colors.text, fontFamily: Fonts.serif, marginBottom: fontSize * 0.35 }]}>
              {props.renderVerse(verses[i])}
            </Text>
          ))}
        </View>
        {idxs && (
          <Text style={[styles.pageNum, { color: colors.muted }]}>
            {index + 1}
          </Text>
        )}
      </PageSheet>
    );
  };

  const deg = (from: number, to: number, range: [number, number]) =>
    progress.interpolate({ inputRange: [0, range[0], range[1], 1], outputRange: [`${from}deg`, `${from}deg`, `${to}deg`, `${to}deg`] });
  const visible = (range: [number, number]) =>
    progress.interpolate({ inputRange: [0, Math.max(0, range[0] - 0.001), range[0], range[1], Math.min(1, range[1] + 0.001), 1], outputRange: [0, 0, 1, 1, 0, 0] });
  const shadeIn = (range: [number, number]) =>
    progress.interpolate({ inputRange: [0, range[0], range[1], 1], outputRange: [0, 0, 0.45, 0.45], extrapolate: 'clamp' });
  const shadeOut = (range: [number, number]) =>
    progress.interpolate({ inputRange: [0, range[0], range[1], 1], outputRange: [0.45, 0.45, 0, 0], extrapolate: 'clamp' });

  let body: ReactNode = null;
  if (ready && size.w > 0) {
    if (!spread) {
      const cur = unit;
      const dir = turning?.dir;
      body = (
        <View style={{ width: pageW, height: pageH }}>
          {dir === 1 ? renderPage(cur + 1, 'single') : renderPage(cur, 'single')}
          {dir === 1 && (
            <Flap origin="left" rotate={deg(0, -90, [0, 1])} opacity={1} shade={shadeIn([0, 1])}>
              {renderPage(cur, 'single')}
            </Flap>
          )}
          {dir === -1 && (
            <Flap origin="left" rotate={deg(-90, 0, [0, 1])} opacity={1} shade={shadeOut([0, 1])}>
              {renderPage(cur - 1, 'single')}
            </Flap>
          )}
        </View>
      );
    } else {
      const l = unit * 2;
      const dir = turning?.dir;
      body = (
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: pageW, height: pageH }}>
            {dir === -1 ? renderPage(l - 2, 'left') : renderPage(l, 'left')}
            {dir === 1 && (
              <Flap origin="right" rotate={deg(90, 0, [0.5, 1])} opacity={visible([0.5, 1])} shade={shadeOut([0.5, 1])}>
                {renderPage(l + 2, 'left')}
              </Flap>
            )}
            {dir === -1 && (
              <Flap origin="right" rotate={deg(0, 90, [0, 0.5])} opacity={visible([0, 0.5])} shade={shadeIn([0, 0.5])}>
                {renderPage(l, 'left')}
              </Flap>
            )}
          </View>
          <View style={{ width: pageW, height: pageH }}>
            {dir === 1 ? renderPage(l + 3, 'right') : renderPage(l + 1, 'right')}
            {dir === 1 && (
              <Flap origin="left" rotate={deg(0, -90, [0, 0.5])} opacity={visible([0, 0.5])} shade={shadeIn([0, 0.5])}>
                {renderPage(l + 1, 'right')}
              </Flap>
            )}
            {dir === -1 && (
              <Flap origin="left" rotate={deg(-90, 0, [0.5, 1])} opacity={visible([0.5, 1])} shade={shadeOut([0.5, 1])}>
                {renderPage(l - 1, 'right')}
              </Flap>
            )}
          </View>
        </View>
      );
    }
  }

  const firstPage = spread ? unit * 2 + 1 : unit + 1;
  const lastPage = spread ? Math.min(pageList.length, unit * 2 + 2) : unit + 1;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.flex} onLayout={onLayout} {...pan.panHandlers}>
        {/* Hidden measuring column (same width/fonts as a page). */}
        {size.w > 0 && !ready && (
          <View pointerEvents="none" style={[styles.measure, { width: contentW }]} key={measureKey}>
            <Text
              onLayout={(e) => record('title', e.nativeEvent.layout.height + 1)}
              style={[styles.title, { fontFamily: Fonts.serif, fontSize: fontSize * 1.6 }]}>
              {props.title}
            </Text>
            {verses.map((v, i) => (
              <View key={v.v} onLayout={(e) => record(i, e.nativeEvent.layout.height + fontSize * 0.35 + 1)}>
                <Text style={[styles.block, { fontSize, lineHeight, fontFamily: Fonts.serif }]}>{props.renderVerse(v)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={[styles.flex, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={styles.bookShadow}>{body}</View>
        </View>
        {/* Tap the outer edges to turn. */}
        <Pressable accessibilityLabel={getT().t('read.prevPage')} onPress={() => turn(-1)} style={[styles.edge, { left: 0 }]} />
        <Pressable accessibilityLabel={getT().t('read.nextPage')} onPress={() => turn(1)} style={[styles.edge, { right: 0 }]} />
      </View>
      <View style={styles.bar}>
        <Pressable onPress={() => turn(-1)} hitSlop={10} style={styles.arrow} accessibilityLabel={getT().t('read.prevPage')}>
          <Text style={[styles.arrowText, { color: colors.accent }]}>‹</Text>
        </Pressable>
        <Text style={{ color: colors.muted, fontSize: 13, minWidth: 70, textAlign: 'center' }}>
          {ready ? (firstPage === lastPage ? `${firstPage} / ${pageList.length}` : `${firstPage}–${lastPage} / ${pageList.length}`) : '…'}
        </Text>
        <Pressable onPress={() => turn(1)} hitSlop={10} style={styles.arrow} accessibilityLabel={getT().t('read.nextPage')}>
          <Text style={[styles.arrowText, { color: colors.accent }]}>›</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {props.bottomBar}
      </View>
    </View>
  );
}

/** A page rotating around one of its vertical edges (the spine). */
function Flap({
  children,
  origin,
  rotate,
  opacity,
  shade,
}: {
  children: ReactNode;
  origin: 'left' | 'right';
  rotate: Animated.AnimatedInterpolation<string>;
  opacity: Animated.AnimatedInterpolation<number> | number;
  shade: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity,
          backfaceVisibility: 'hidden',
          transformOrigin: origin === 'left' ? 'left center' : 'right center',
          transform: [{ perspective: 1800 }, { rotateY: rotate }],
        },
      ]}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: shade }]} />
    </Animated.View>
  );
}

/** One sheet of paper with texture, edge shading and the spine shadow. */
function PageSheet({
  children,
  colors,
  side,
  width,
  height,
}: {
  children: ReactNode;
  colors: BookColors;
  side: 'left' | 'right' | 'single';
  width: number;
  height: number;
}) {
  const radius = 4;
  const corners =
    side === 'left'
      ? { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }
      : side === 'right'
        ? { borderTopRightRadius: radius, borderBottomRightRadius: radius }
        : { borderRadius: radius };
  const content = (
    <>
      {children}
      {/* spine shading */}
      {side !== 'single' && (
        <LinearGradient
          pointerEvents="none"
          colors={side === 'left' ? ['transparent', colors.shade] : [colors.shade, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.spine, side === 'left' ? { right: 0 } : { left: 0 }]}
        />
      )}
      {side === 'single' && (
        <LinearGradient
          pointerEvents="none"
          colors={[colors.shade, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.spine, { left: 0, width: 18 }]}
        />
      )}
    </>
  );
  const style = [{ width, height, backgroundColor: colors.base, overflow: 'hidden' as const }, corners];
  if (colors.texture)
    return (
      <ImageBackground source={colors.texture as number} resizeMode="repeat" style={style} imageStyle={corners}>
        {content}
      </ImageBackground>
    );
  return <View style={style}>{content}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  measure: { position: 'absolute', top: 0, left: 0, opacity: 0 },
  title: { fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  block: {},
  pageNum: { position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 12 },
  spine: { position: 'absolute', top: 0, bottom: 0, width: 36 },
  bookShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderRadius: 4,
  },
  edge: { position: 'absolute', top: 0, bottom: 0, width: 28 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  arrow: { paddingHorizontal: 10, paddingVertical: 2 },
  arrowText: { fontSize: 30, lineHeight: 32, fontWeight: '300' },
});

type Ctl = {
  busy: boolean;
  dragDir: 1 | -1 | null;
  p: number;
  api: null | {
    canTurn: (dir: 1 | -1) => boolean;
    turn: (dir: 1 | -1) => void;
    finishTurn: (dir: 1 | -1, complete: boolean) => void;
    start: (dir: 1 | -1) => void;
    unitWidth: number;
  };
};

/** Updates the gesture bookkeeping object in place (it's shared with event handlers). */
function patch(c: Ctl, values: Partial<Ctl>) {
  Object.assign(c, values);
}

/** Horizontal drag that drives the page-turn animation. */
function createPageGesture(ctl: Ctl, progress: Animated.Value) {
  return PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => {
      ctl.dragDir = null;
    },
    onPanResponderMove: (_, g) => {
      const api = ctl.api;
      if (!api) return;
      if (ctl.dragDir === null) {
        if (ctl.busy) return;
        const dir: 1 | -1 = g.dx < 0 ? 1 : -1;
        ctl.dragDir = dir;
        if (!api.canTurn(dir)) return; // chapter change is handled on release
        ctl.busy = true;
        api.start(dir);
      }
      if (!api.canTurn(ctl.dragDir)) return;
      const p = Math.max(0, Math.min(1, Math.abs(g.dx) / (api.unitWidth * 0.75)));
      ctl.p = p;
      progress.setValue(p);
    },
    onPanResponderRelease: (_, g) => {
      const api = ctl.api;
      const dir = ctl.dragDir;
      ctl.dragDir = null;
      if (dir === null || !api) return;
      if (!ctl.busy) {
        if (Math.abs(g.dx) > 70) api.turn(dir);
        return;
      }
      const fast = Math.abs(g.vx) > 0.4 && Math.sign(g.vx) === -dir;
      api.finishTurn(dir, ctl.p > 0.33 || fast);
    },
    onPanResponderTerminate: () => {
      const api = ctl.api;
      const dir = ctl.dragDir;
      ctl.dragDir = null;
      if (dir !== null && api && ctl.busy) api.finishTurn(dir, false);
    },
  });
}
