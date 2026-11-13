import { getLocales } from 'expo-localization';

import { getSettings, useSettings } from '@/lib/settings';
import { en, type Dict } from './en';
import { es } from './es';
import { ko } from './ko';

export type AppLang = 'en' | 'es' | 'ko';
export type TKey = keyof Dict;

const DICTS: Record<AppLang, Dict> = { en, es, ko };

export const LANGUAGES: { code: AppLang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'ko', name: '한국어' },
];

function deviceLang(): AppLang {
  try {
    const code = getLocales()[0]?.languageCode ?? 'en';
    return code === 'es' || code === 'ko' ? code : 'en';
  } catch {
    return 'en';
  }
}

export function resolveLang(setting: 'auto' | AppLang): AppLang {
  return setting === 'auto' ? deviceLang() : setting;
}

/** Fills {placeholders}. */
function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export function makeT(lang: AppLang) {
  const d = DICTS[lang];
  const t = (key: TKey, vars?: Record<string, string | number>) => fill(d[key] ?? en[key], vars);
  /** Picks `key_one` when n === 1, otherwise `key_other` (pass the base key). */
  const tn = (base: string, n: number, vars?: Record<string, string | number>) => {
    const key = `${base}_${n === 1 ? 'one' : 'other'}` as TKey;
    return t(key, { n, ...vars });
  };
  const locale = lang === 'ko' ? 'ko-KR' : lang === 'es' ? 'es' : 'en';
  const date = (d: Date | string, opts?: Intl.DateTimeFormatOptions) =>
    (typeof d === 'string' ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d).toLocaleDateString(locale, opts);
  return { t, tn, lang, locale, date };
}

export type T = ReturnType<typeof makeT>;

/** Translation helpers for the app's current language (from Settings). */
export function useT(): T {
  const s = useSettings();
  return makeT(resolveLang(s.appLanguage));
}

/** Same, outside React (e.g. notifications). */
export function getT(): T {
  return makeT(resolveLang(getSettings().appLanguage));
}
