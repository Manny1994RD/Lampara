import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type Settings = {
  translationId: string | null;
  fontSize: number;
  book: number;
  chapter: number;
  /** 'auto' = use the language of the current translation. */
  bookNames: 'auto' | 'en' | 'es';
};

const DEFAULTS: Settings = {
  translationId: null,
  fontSize: 19,
  book: 43,
  chapter: 1,
  bookNames: 'auto',
};

const KEY = 'settings.v1';

let state: Settings = load();
const listeners = new Set<() => void>();

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
