import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, HighlightColors, TABLET_BREAKPOINT, type HighlightColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function useIsTablet() {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT;
}

export function highlightBg(color: HighlightColor, dark: boolean) {
  return HighlightColors[color]?.[dark ? 1 : 0] ?? HighlightColors.yellow[dark ? 1 : 0];
}

/* --------------------------------- text --------------------------------- */

type TxtVariant = 'title' | 'heading' | 'body' | 'label' | 'small' | 'caption' | 'serif';

export function Txt({
  variant = 'body',
  muted,
  color,
  style,
  ...rest
}: TextProps & { variant?: TxtVariant; muted?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <Text
      style={[
        textStyles[variant],
        { color: color ?? (muted ? t.textSecondary : t.text) },
        style as StyleProp<TextStyle>,
      ]}
      {...rest}
    />
  );
}

const textStyles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', fontFamily: Fonts.sans, letterSpacing: -0.6 },
  heading: { fontSize: 18, fontWeight: '700', fontFamily: Fonts.sans, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontFamily: Fonts.sans },
  label: { fontSize: 15, fontWeight: '600', fontFamily: Fonts.sans },
  small: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.sans },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, fontFamily: Fonts.sans },
  serif: { fontSize: 18, lineHeight: 28, fontFamily: Fonts.serif },
});

/* -------------------------------- layout -------------------------------- */

export function Screen({
  children,
  scroll = true,
  maxWidth = 900,
  padded = true,
  header,
}: {
  children: ReactNode;
  scroll?: boolean;
  maxWidth?: number;
  padded?: boolean;
  header?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const inner = (
    <View style={[styles.inner, { maxWidth }, padded && styles.padded]}>{children}</View>
  );
  return (
    <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base = [styles.card, { backgroundColor: t.card }, style];
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.75 }]}>
        {children}
      </Pressable>
    );
  return <View style={base}>{children}</View>;
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ marginTop: 28, marginBottom: 12, justifyContent: 'space-between' }}>
      <Txt variant="heading">{children}</Txt>
      {right}
    </Row>
  );
}

/* -------------------------------- buttons ------------------------------- */

export function Button({
  title,
  onPress,
  icon,
  kind = 'primary',
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const t = useTheme();
  // Primary = solid ink (black on light, white on dark); secondary = soft grey pill; ghost = text only.
  const bg = kind === 'primary' ? t.ink : kind === 'secondary' ? t.cardAlt : 'transparent';
  const fg = kind === 'primary' ? t.onInk : kind === 'danger' ? t.danger : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        kind === 'danger' && { borderWidth: 1, borderColor: t.danger },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 18} color={fg} />}
          <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 22,
  active,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  active?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        active && { backgroundColor: t.cardAlt },
        pressed && { opacity: 0.6 },
      ]}>
      <Ionicons name={icon} size={size} color={color ?? t.text} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? t.ink : t.card,
          borderColor: selected ? t.ink : t.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      {color && <View style={[styles.dot, { backgroundColor: color }]} />}
      {icon && <Ionicons name={icon} size={14} color={selected ? t.onInk : t.text} />}
      <Text style={{ color: selected ? t.onInk : t.text, fontSize: 14, fontWeight: '600', fontFamily: Fonts.sans }}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, height = 8, color }: { value: number; height?: number; color?: string }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: t.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? t.accent, borderRadius: height }} />
    </View>
  );
}

export function ColorSwatches({
  value,
  onChange,
  allowNone,
}: {
  value?: HighlightColor | null;
  onChange: (c: HighlightColor | null) => void;
  allowNone?: boolean;
}) {
  const t = useTheme();
  return (
    <Row gap={12} style={{ flexWrap: 'wrap' }}>
      {(Object.keys(HighlightColors) as HighlightColor[]).map((c) => (
        <Pressable
          key={c}
          accessibilityLabel={`${c} highlight`}
          onPress={() => onChange(c)}
          style={[
            styles.swatch,
            { backgroundColor: highlightBg(c, t.dark), borderColor: value === c ? t.text : t.border },
            value === c && { borderWidth: 3 },
          ]}
        />
      ))}
      {allowNone && (
        <Pressable
          accessibilityLabel="Remove highlight"
          onPress={() => onChange(null)}
          style={[styles.swatch, { borderColor: t.border, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="close" size={18} color={t.textSecondary} />
        </Pressable>
      )}
    </Row>
  );
}

/* --------------------------------- sheet -------------------------------- */

/** A bottom sheet on phones, a centered dialog on tablets / web. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  const { t: tr } = useT();
  const tablet = useIsTablet();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={tablet ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.backdrop, tablet && { justifyContent: 'center', alignItems: 'center' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={tr('common.close')} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: t.background, paddingBottom: 20 + insets.bottom },
            tablet && styles.dialog,
          ]}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <Txt variant="heading" style={{ flex: 1 }} numberOfLines={1}>
              {title}
            </Txt>
            <IconButton icon="close" label={tr('common.close')} onPress={onClose} />
          </Row>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={t.accent} />
      <Txt variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {body && (
        <Txt muted style={{ textAlign: 'center', maxWidth: 420 }}>
          {body}
        </Txt>
      )}
      {action}
    </View>
  );
}

export { Ionicons };

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  inner: { width: '100%', alignSelf: 'center', flexGrow: 1 },
  padded: { paddingHorizontal: 16, paddingTop: 12 },
  card: { borderRadius: 18, padding: 16 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    minHeight: 48,
  },
  buttonSmall: { paddingHorizontal: 14, paddingVertical: 7, minHeight: 34 },
  buttonText: { fontSize: 16, fontWeight: '700', fontFamily: Fonts.sans },
  iconButton: { padding: 8, borderRadius: 999 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  swatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    maxHeight: '88%',
  },
  dialog: { borderRadius: 26, width: 520, maxWidth: '92%', maxHeight: '85%' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
});
