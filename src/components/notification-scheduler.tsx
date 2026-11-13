import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { useTranslations } from '@/hooks/use-translation';
import { subscribe } from '@/lib/db';
import { notificationsSupported, rescheduleNotifications } from '@/lib/notifications';
import { updateSettings, useSettings } from '@/lib/settings';

/** Keeps scheduled notifications up to date and opens the right screen when one is tapped. */
export function NotificationScheduler() {
  const db = useSQLiteContext();
  const settings = useSettings();
  const { current, lang } = useTranslations();
  const tr = current?.id ?? null;
  const key = [settings.votdEnabled, settings.votdHour, settings.votdMinute, settings.reminderEnabled, settings.reminderHour, settings.reminderMinute, tr, lang].join('|');

  useEffect(() => {
    if (!notificationsSupported) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        rescheduleNotifications(db, settings, tr, lang).catch((e) => console.warn('notifications', e));
      }, 800);
    };
    run();
    const unsub = subscribe((t) => {
      if (t === 'reads' || t === 'plans' || t === 'translations') run();
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key]);

  useEffect(() => {
    if (!notificationsSupported) return;
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as { url?: string; book?: number; ch?: number };
      if (data?.book && data?.ch) updateSettings({ book: data.book, chapter: data.ch });
      if (data?.url === '/read') router.navigate('/read');
      else router.navigate('/');
    });
    return () => sub.remove();
  }, []);

  return null;
}
