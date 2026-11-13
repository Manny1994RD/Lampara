import '@/global.css';

import { Platform } from 'react-native';

/** Warm "lamp light on paper" palette. */
export const Colors = {
  light: {
    text: '#2B2118',
    textSecondary: '#7A6A58',
    background: '#FBF7F0',
    card: '#FFFFFF',
    cardAlt: '#F3ECE0',
    border: '#E6DCCB',
    accent: '#B8741A',
    accentSoft: '#F6E3C4',
    onAccent: '#FFFFFF',
    danger: '#B3261E',
    success: '#3C7A3A',
  },
  dark: {
    text: '#EFE6D8',
    textSecondary: '#AD9E8A',
    background: '#16120E',
    card: '#211B15',
    cardAlt: '#2A221A',
    border: '#3A3026',
    accent: '#E0A44A',
    accentSoft: '#3D2E1A',
    onAccent: '#1A140E',
    danger: '#F2B8B5',
    success: '#9ED39A',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

/** Highlight colors: [light mode, dark mode]. */
export const HighlightColors = {
  yellow: ['#FFE58A', '#6B5A12'],
  green: ['#C6EBC0', '#2C5A2A'],
  blue: ['#C2DFF8', '#1F4A6E'],
  pink: ['#F8C9DD', '#6A2A48'],
  orange: ['#FFD4A8', '#6E4318'],
  purple: ['#DDCEF6', '#46356E'],
} as const;

export type HighlightColor = keyof typeof HighlightColors;
export const HIGHLIGHT_KEYS = Object.keys(HighlightColors) as HighlightColor[];

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'Georgia' },
  android: { sans: 'sans-serif', serif: 'serif' },
  default: { sans: 'var(--font-display)', serif: 'var(--font-serif)' },
})!;

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;

/** Width at which the layout switches to the tablet (side rail) design. */
export const TABLET_BREAKPOINT = 768;
export const ReaderMaxWidth = 720;
