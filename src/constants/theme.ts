import '@/global.css';

import { Platform } from 'react-native';

/**
 * Clean, minimal palette: white (or near-black) backgrounds, soft grey surfaces,
 * black/white "ink" for primary actions and one warm flame accent for the Lámpara brand.
 */
export const Colors = {
  light: {
    text: '#121212',
    textSecondary: '#6E6E73',
    background: '#FFFFFF',
    card: '#F5F5F4',
    cardAlt: '#EBEBEA',
    border: '#E5E5E3',
    accent: '#E8590C',
    accentSoft: '#FFF0E6',
    onAccent: '#FFFFFF',
    ink: '#121212',
    onInk: '#FFFFFF',
    danger: '#D92D20',
    success: '#16A34A',
  },
  dark: {
    text: '#F5F5F5',
    textSecondary: '#A1A1A6',
    background: '#0B0B0C',
    card: '#18181A',
    cardAlt: '#232326',
    border: '#2A2A2D',
    accent: '#FF7A33',
    accentSoft: '#2E1A0F',
    onAccent: '#140B05',
    ink: '#F5F5F5',
    onInk: '#0B0B0C',
    danger: '#F97066',
    success: '#4ADE80',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

/** Highlight colors: [light mode, dark mode]. */
export const HighlightColors = {
  yellow: ['#FFE98A', '#6B5A12'],
  green: ['#C9F0C2', '#24552A'],
  blue: ['#C6E2FB', '#1D466B'],
  pink: ['#FBCFE2', '#672A47'],
  orange: ['#FFD5B0', '#6E3F14'],
  purple: ['#DFD2F8', '#45356D'],
} as const;

export type HighlightColor = keyof typeof HighlightColors;
export const HIGHLIGHT_KEYS = Object.keys(HighlightColors) as HighlightColor[];

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'Georgia' },
  android: { sans: 'sans-serif', serif: 'serif' },
  default: { sans: 'var(--font-display)', serif: 'var(--font-serif)' },
})!;

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;

export const Radius = { card: 18, button: 999, chip: 999, input: 14 } as const;

/** Width at which the layout switches to the tablet (side rail) design. */
export const TABLET_BREAKPOINT = 768;
export const ReaderMaxWidth = 720;
