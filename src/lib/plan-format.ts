import { router } from 'expo-router';

import { bookName, type Lang } from '@/data/books';
import type { PlanDay } from './plans';
import { updateSettings } from './settings';

export function openChapter(book: number, ch: number) {
  updateSettings({ book, chapter: ch });
  router.navigate('/read');
}

/** "Génesis 1–3, Job 1" style label for a day's chapters. */
export function dayLabel(day: PlanDay, lang: Lang) {
  const parts: string[] = [];
  let i = 0;
  const cs = day.chapters;
  while (i < cs.length) {
    let j = i;
    while (j + 1 < cs.length && cs[j + 1].book === cs[i].book && cs[j + 1].ch === cs[j].ch + 1) j++;
    parts.push(`${bookName(cs[i].book, lang)} ${cs[i].ch}${j > i ? `–${cs[j].ch}` : ''}`);
    i = j + 1;
  }
  return parts.join(', ');
}
