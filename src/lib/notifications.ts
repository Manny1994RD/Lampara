import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import type { Lang } from '@/data/books';
import { getT } from '@/i18n';
import { localDay } from './db';
import { dayLabel } from './plan-format';
import { getActivePlanProgress } from './plans';
import type { Settings } from './settings';
import { getVotd } from './votd';

/** Sends the next two weeks of verses to the Android home-screen widget. */
export async function updateVotdWidget(db: SQLiteDatabase, tr: string | null, lang: Lang) {
  if (Platform.OS !== 'android') return;
  const { VotdWidget } = await import('@/widgets/votd-widget');
  const { t } = getT();
  const days = [];
  const now = new Date();
  for (let i = 0; i < VOTD_DAYS_AHEAD; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const v = await getVotd(db, tr, lang, day);
    days.push({ day: localDay(day), label: v.label, text: v.text });
  }
  VotdWidget.updateSnapshot({ title: t('today.votd'), days, empty: t('notif.openToRead') });
}

export const notificationsSupported = Platform.OS !== 'web';

const CHANNEL = 'daily';
const VOTD_DAYS_AHEAD = 14;
const REMINDER_DAYS_AHEAD = 7;

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Asks for permission (creates the Android channel first). Returns true when allowed. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: getT().t('notif.channel'),
      // eslint-disable-next-line import/namespace -- re-exported enum the lint resolver can't follow
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

function at(day: Date, hour: number, minute: number) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Local notifications can't compute their text when they fire, so we schedule the next
 * couple of weeks individually (each with its own verse) and refresh whenever the app opens
 * or reading data changes.
 */
export async function rescheduleNotifications(
  db: SQLiteDatabase,
  settings: Settings,
  tr: string | null,
  lang: Lang
) {
  if (!notificationsSupported) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.votdEnabled && !settings.reminderEnabled) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const now = new Date();
  const { t } = getT();

  if (settings.votdEnabled) {
    for (let i = 0; i < VOTD_DAYS_AHEAD; i++) {
      const day = new Date(now);
      day.setDate(now.getDate() + i);
      const when = at(day, settings.votdHour, settings.votdMinute);
      if (when <= now) continue;
      const v = await getVotd(db, tr, lang, day);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notif.votdTitle', { ref: v.label }),
          body: v.text ? (v.text.length > 220 ? `${v.text.slice(0, 217)}…` : v.text) : t('notif.openToRead'),
          data: { url: '/read', book: v.book, ch: v.ch },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
      });
    }
  }

  if (settings.reminderEnabled) {
    const readToday = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM chapter_reads WHERE day = ?',
      localDay()
    );
    const plans = await getActivePlanProgress(db);
    const next = plans[0]?.nextDay;
    const body = next ? t('notif.upNext', { label: dayLabel(next, lang) }) : t('notif.reminderBody');
    for (let i = 0; i < REMINDER_DAYS_AHEAD; i++) {
      if (i === 0 && (readToday?.c ?? 0) > 0) continue; // already read today
      const day = new Date(now);
      day.setDate(now.getDate() + i);
      const when = at(day, settings.reminderHour, settings.reminderMinute);
      if (when <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notif.reminderTitle'),
          body,
          data: { url: '/' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
      });
    }
  }
}
