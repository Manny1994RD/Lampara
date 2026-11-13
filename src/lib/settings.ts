import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type Settings = {
  translationId: string | null;
  fontSize: number;
  book: number;
  chapter: number;
  /** Language of the app's menus and buttons ('auto' = the phone's language). */
  appLanguage: 'auto' | 'en' | 'es' | 'ko';
  /** 'auto' = use the language of the current translation. */
  bookNames: 'auto' | 'en' | 'es' | 'ko';
  /** 'scroll' = continuous page, 'book' = pages you turn. */
  readerMode: 'scroll' | 'book';
  /** Paper background for the reader ('none' = app colors). */
  paper: 'none' | 'cream' | 'parchment' | 'sepia' | 'white' | 'linen' | 'night';
  /** Two pages side by side when the screen is wide (landscape tablet). */
  twoPages: boolean;
  /** Badge ids the user has already been shown (to celebrate new ones once). */
  seenBadges: string[];
  /** Daily verse-of-the-day notification. */
  votdEnabled: boolean;
  votdHour: number;
  votdMinute: number;
  /** Daily reading reminder (only sent if you haven't read yet that day). */
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
};

const DEFAULTS: Settings = {
  translationId: null,
  fontSize: 19,
  book: 43,
  chapter: 1,
  appLanguage: 'auto',
  bookNames: 'auto',
  readerMode: 'scroll',
  paper: 'cream',
  twoPages: true,
  seenBadges: [],
  votdEnabled: false,
  votdHour: 7,
  votdMinute: 0,
  reminderEnabled: false,
  reminderHour: 20,
  reminderMinute: 0,
};

const KEY = 'settings.v1';

// On the web, synchronous SQLite needs cross-origin isolation (not available in every browser/webview),
// so small settings live in localStorage there. Phones use the SQLite key-value store.
const store = {
  get(): string | null {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return Storage.getItemSync(KEY);
  },
  set(value: string) {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
    else Storage.setItemSync(KEY, value);
  },
};

function load(): Settings {
  try {
    const raw = store.get();
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

// Must come after `store` (load() reads it immediately).
let state: Settings = load();
const listeners = new Set<() => void>();

export function getSettings() {
  return state;
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try {
    store.set(JSON.stringify(state));
  } catch {
    // storage unavailable: keep in memory only
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state
  );
}
