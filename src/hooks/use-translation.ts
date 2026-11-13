import { useLive } from '@/hooks/use-live';
import { resolveLang } from '@/i18n';
import { getTranslations, type Translation } from '@/lib/data';
import { useSettings } from '@/lib/settings';
import type { Lang } from '@/data/books';

/**
 * Imported translations, the one currently selected, and the language to use for book names
 * (by default the language of the Bible you're reading; otherwise the app language).
 */
export function useTranslations(): {
  list: Translation[] | undefined;
  current: Translation | null;
  lang: Lang;
} {
  const settings = useSettings();
  const list = useLive((db) => getTranslations(db), [], ['translations']);
  const current = list?.find((t) => t.id === settings.translationId) ?? list?.[0] ?? null;
  const lang: Lang =
    settings.bookNames === 'auto' ? (current?.lang ?? resolveLang(settings.appLanguage)) : settings.bookNames;
  return { list, current, lang };
}
