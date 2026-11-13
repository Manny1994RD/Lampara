import type { SQLiteDatabase } from 'expo-sqlite';

import { planChapters, splitIntoDays, type ChapterRef, type PlanKind } from '@/data/plans';
import { localDay, newId, notify, nowIso } from './db';

export type PlanRow = {
  id: string;
  name: string;
  kind: PlanKind;
  books: string | null;
  days: number;
  start_day: string;
  started_at: string;
  status: 'active' | 'done' | 'archived';
  completed_at: string | null;
  created_at: string;
};

export type PlanDay = { index: number; date: string; chapters: (ChapterRef & { done: boolean })[]; done: boolean };

export type PlanProgress = {
  plan: PlanRow;
  schedule: PlanDay[];
  todayIndex: number; // may be <0 (not started) or >= days (past the end)
  doneChapters: number;
  totalChapters: number;
  /** Unread chapters from days before today (0 = on track). */
  behind: number;
  today: PlanDay | null;
  /** First day that still has unread chapters. */
  nextDay: PlanDay | null;
  finished: boolean;
};

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
}

export async function createPlan(
  db: SQLiteDatabase,
  p: { name: string; kind: PlanKind; books?: number[]; days: number; startDay?: string }
) {
  const id = newId();
  const start = p.startDay ?? localDay();
  // started_at is the beginning of the start day, so chapters read earlier that day count.
  const startedAt = new Date(`${start}T00:00:00`).toISOString();
  await db.runAsync(
    `INSERT INTO plans (id, name, kind, books, days, start_day, started_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    id,
    p.name.trim(),
    p.kind,
    p.books?.length ? JSON.stringify(p.books) : null,
    Math.max(1, Math.round(p.days)),
    start,
    startedAt,
    nowIso()
  );
  notify('plans');
  return id;
}

export async function setPlanStatus(db: SQLiteDatabase, id: string, status: PlanRow['status']) {
  await db.runAsync(
    'UPDATE plans SET status = ?, completed_at = ? WHERE id = ?',
    status,
    status === 'done' ? nowIso() : null,
    id
  );
  notify('plans');
}

export async function deletePlan(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM plans WHERE id = ?', id);
  notify('plans');
}

export function getPlans(db: SQLiteDatabase) {
  return db.getAllAsync<PlanRow>(
    `SELECT * FROM plans ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'done' THEN 1 ELSE 2 END, created_at DESC`
  );
}

export async function getPlanProgress(db: SQLiteDatabase, plan: PlanRow): Promise<PlanProgress> {
  const chapters = planChapters(plan.kind, plan.books ? JSON.parse(plan.books) : []);
  const reads = await db.getAllAsync<{ book: number; ch: number }>(
    'SELECT DISTINCT book, ch FROM chapter_reads WHERE read_at >= ?',
    plan.started_at
  );
  const done = new Set(reads.map((r) => `${r.book}:${r.ch}`));
  const days = splitIntoDays(chapters, plan.days);
  const schedule: PlanDay[] = days.map((chs, i) => {
    const withDone = chs.map((c) => ({ ...c, done: done.has(`${c.book}:${c.ch}`) }));
    return { index: i, date: addDays(plan.start_day, i), chapters: withDone, done: withDone.every((c) => c.done) };
  });
  const todayIndex = daysBetween(plan.start_day, localDay());
  const doneChapters = schedule.reduce((s, d) => s + d.chapters.filter((c) => c.done).length, 0);
  // Only days before today count as "due" — today's reading isn't late yet.
  const dueBeforeToday = schedule
    .slice(0, Math.max(0, Math.min(schedule.length, todayIndex)))
    .reduce((s, d) => s + d.chapters.length, 0);
  // Chapters read ahead of schedule shouldn't hide missed earlier days, so count done chapters in due days only.
  const doneInDue = schedule
    .slice(0, Math.max(0, Math.min(schedule.length, todayIndex)))
    .reduce((s, d) => s + d.chapters.filter((c) => c.done).length, 0);
  const finished = doneChapters === chapters.length;
  return {
    plan,
    schedule,
    todayIndex,
    doneChapters,
    totalChapters: chapters.length,
    behind: dueBeforeToday - doneInDue,
    today: schedule[todayIndex] ?? null,
    nextDay: schedule.find((d) => !d.done) ?? null,
    finished,
  };
}

/** Active plans with progress; marks plans finished when every chapter is done. */
export async function getActivePlanProgress(db: SQLiteDatabase) {
  const plans = (await getPlans(db)).filter((p) => p.status === 'active');
  const out: PlanProgress[] = [];
  for (const p of plans) {
    const prog = await getPlanProgress(db, p);
    if (prog.finished) {
      await db.runAsync("UPDATE plans SET status = 'done', completed_at = ? WHERE id = ?", nowIso(), p.id);
      continue;
    }
    out.push(prog);
  }
  return out;
}

export async function countCompletedPlans(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) AS c FROM plans WHERE status = 'done'");
  return r?.c ?? 0;
}
