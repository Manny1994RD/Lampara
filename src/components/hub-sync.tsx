import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { subscribe } from '@/lib/db';
import { refreshAuth, useHub } from '@/lib/hub';
import { refreshHubBibles } from '@/lib/hub-bibles';
import { updateChallengeProgress } from '@/lib/social';
import { syncNow } from '@/lib/sync';

/**
 * Keeps this device in sync with your hub while you're signed in:
 * on start, a few seconds after you change something, when the app comes back
 * to the foreground, and every few minutes. Also lists the Bibles stored on the hub.
 */
export function HubSync() {
  const db = useSQLiteContext();
  const hub = useHub();
  const signedIn = !!hub;

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    const run = async () => {
      // Bibles on the hub show up on every device automatically.
      await refreshHubBibles(db).catch((e) => {
        if (alive) console.warn('hub Bibles failed', e instanceof Error ? e.message : e);
      });
      try {
        await syncNow(db);
        await updateChallengeProgress(db);
      } catch (e) {
        if (alive) console.warn('sync failed', e instanceof Error ? e.message : e);
      }
    };
    const soon = (ms = 3000) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ms);
    };

    refreshAuth()
      .catch(() => undefined)
      .finally(() => soon(500));
    const unsub = subscribe((t) => {
      if (t === 'reads' || t === 'highlights' || t === 'bookmarks' || t === 'notes' || t === 'topics' || t === 'plans') soon();
    });
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') soon(500);
    });
    const interval = setInterval(run, 5 * 60 * 1000);

    return () => {
      alive = false;
      unsub();
      appState.remove();
      clearInterval(interval);
      if (timer) clearTimeout(timer);
    };
  }, [db, signedIn]);

  return null;
}
