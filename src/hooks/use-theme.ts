import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme(): Palette & { dark: boolean } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { ...(dark ? Colors.dark : Colors.light), dark };
}
