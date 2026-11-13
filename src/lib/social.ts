import type { SQLiteDatabase } from 'expo-sqlite';

import { getBook } from '@/data/books';
import { notify } from './db';
import { getHub, hubFetch, listPath, pbq, type HubUser } from './hub';

type List<T> = { items: T[] };
type PBUser = { id: string; name: string; friend_code: string };

/* ------------------------------- invites -------------------------------- */

export type Invite = { id: string; code: string; note: string; used_by: string; created: string; expand?: { used_by?: PBUser } };

export async function listInvites() {
  const me = getHub()!.user.id;
  return (await hubFetch<List<Invite>>(listPath('invites', { filter: `created_by = ${pbq(me)}`, sort: '-created', expand: 'used_by' }))).items;
}

export async function createInvite(note = '') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  const inv = await hubFetch<Invite>('/api/collections/invites/records', {
    method: 'POST',
    body: { code, note, created_by: getHub()!.user.id },
  });
  notify('social');
  return inv;
}

export async function deleteInvite(id: string) {
  await hubFetch(`/api/collections/invites/records/${id}`, { method: 'DELETE' });
  notify('social');
}

/* ------------------------------- friends -------------------------------- */

export type Friend = { friendshipId: string; user: PBUser; status: 'pending' | 'accepted'; incoming: boolean };

type FriendshipRow = { id: string; from: string; to: string; status: 'pending' | 'accepted'; expand?: { from?: PBUser; to?: PBUser } };

export async function listFriends(): Promise<Friend[]> {
  const me = getHub()!.user.id;
  const rows = (await hubFetch<List<FriendshipRow>>(listPath('friendships', { expand: 'from,to', sort: '-created' }))).items;
  return rows
    .map((r) => {
      const incoming = r.to === me;
      const user = incoming ? r.expand?.from : r.expand?.to;
      return user ? { friendshipId: r.id, user, status: r.status, incoming } : null;
    })
    .filter((x): x is Friend => !!x);
}

export async function addFriendByCode(code: string) {
  const hub = getHub()!;
  const c = code.trim().toUpperCase();
  if (c === hub.user.friend_code) throw new Error("That's your own friend code.");
  const found = (await hubFetch<List<PBUser>>(listPath('users', { filter: `friend_code = ${pbq(c)}` }))).items[0];
  if (!found) throw new Error('No one on this hub has that friend code.');
  const existing = await listFriends();
  if (existing.some((f) => f.user.id === found.id)) throw new Error(`You and ${found.name} are already connected.`);
  await hubFetch('/api/collections/friendships/records', {
    method: 'POST',
    body: { from: hub.user.id, to: found.id, status: 'pending' },
  });
  notify('social');
  return found;
}

export async function acceptFriend(friendshipId: string) {
  await hubFetch(`/api/collections/friendships/records/${friendshipId}`, { method: 'PATCH', body: { status: 'accepted' } });
  notify('social');
}

export async function removeFriend(friendshipId: string) {
  await hubFetch(`/api/collections/friendships/records/${friendshipId}`, { method: 'DELETE' });
  notify('social');
}

/* ------------------------------ challenges ------------------------------ */

export type Goal = 'chapters' | 'days' | 'books';

export type Challenge = {
  id: string;
  owner: string;
  title: string;
  message: string;
  goal: Goal;
  target: number;
  books: number[] | null;
  start_day: string;
  end_day: string;
  expand?: { owner?: PBUser };
};

export type Member = { id: string; challenge: string; user: string; progress: number; done: boolean; updated: string; expand?: { user?: PBUser } };

export type Activity = {
  id: string;
  challenge: string;
  user: string;
  target: string;
  kind: 'joined' | 'progress' | 'completed' | 'cheer' | 'nudge';
  text: string;
  emoji: string;
  created: string;
  expand?: { user?: PBUser; target?: PBUser };
};

export function challengeTarget(c: Pick<Challenge, 'goal' | 'target' | 'books'>) {
  if (c.goal === 'books') return (c.books ?? []).reduce((s, b) => s + (getBook(b)?.chapters ?? 0), 0);
  return c.target;
}

export async function listChallenges() {
  return (await hubFetch<List<Challenge>>(listPath('challenges', { sort: '-end_day', expand: 'owner' }))).items;
}

export async function getChallenge(id: string) {
  const [challenge, members, activity] = await Promise.all([
    hubFetch<Challenge>(`/api/collections/challenges/records/${id}?expand=owner`),
    hubFetch<List<Member>>(listPath('challenge_members', { filter: `challenge = ${pbq(id)}`, expand: 'user', sort: '-progress' })),
    hubFetch<List<Activity>>(listPath('activity', { filter: `challenge = ${pbq(id)}`, expand: 'user,target', sort: '-created', perPage: 60 })),
  ]);
  return { challenge, members: members.items, activity: activity.items };
}

export async function myMemberships() {
  const me = getHub()!.user.id;
  return (await hubFetch<List<Member>>(listPath('challenge_members', { filter: `user = ${pbq(me)}` }))).items;
}

export async function createChallenge(
  db: SQLiteDatabase,
  c: { title: string; message: string; goal: Goal; target: number; books: number[]; start_day: string; end_day: string },
  friendIds: string[]
) {
  const me = getHub()!.user;
  const created = await hubFetch<Challenge>('/api/collections/challenges/records', {
    method: 'POST',
    body: { ...c, books: c.goal === 'books' ? c.books : null, owner: me.id },
  });
  for (const uid of [me.id, ...friendIds]) {
    await hubFetch('/api/collections/challenge_members/records', {
      method: 'POST',
      body: { challenge: created.id, user: uid, progress: 0, done: false },
    });
  }
  await postActivity(created.id, 'joined', `${me.name} started the challenge`);
  await updateChallengeProgress(db);
  notify('social');
  return created;
}

export async function leaveChallenge(memberId: string) {
  await hubFetch(`/api/collections/challenge_members/records/${memberId}`, { method: 'DELETE' });
  notify('social');
}

export async function deleteChallenge(id: string) {
  await hubFetch(`/api/collections/challenges/records/${id}`, { method: 'DELETE' });
  notify('social');
}

export async function postActivity(challenge: string, kind: Activity['kind'], text: string, extra: { target?: string; emoji?: string } = {}) {
  await hubFetch('/api/collections/activity/records', {
    method: 'POST',
    body: { challenge, user: getHub()!.user.id, kind, text, target: extra.target ?? '', emoji: extra.emoji ?? '' },
  });
  notify('social');
}

export async function cheer(challenge: string, to: HubUser | PBUser, emoji: string, kind: 'cheer' | 'nudge' = 'cheer') {
  const me = getHub()!.user;
  const text =
    kind === 'nudge' ? `${me.name} nudged ${to.name} — let's read today!` : `${me.name} cheered ${to.name} ${emoji}`;
  await postActivity(challenge, kind, text, { target: to.id, emoji });
}

/* ------------------------- progress from this device ------------------------- */

/** Progress for one challenge, from this device's reading history. */
export async function localProgress(db: SQLiteDatabase, c: Pick<Challenge, 'goal' | 'books' | 'start_day' | 'end_day'>) {
  if (c.goal === 'days') {
    const r = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(DISTINCT day) AS n FROM chapter_reads WHERE day BETWEEN ? AND ?',
      c.start_day,
      c.end_day
    );
    return r?.n ?? 0;
  }
  if (c.goal === 'books') {
    const books = c.books ?? [];
    if (!books.length) return 0;
    const r = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (SELECT DISTINCT book, ch FROM chapter_reads
        WHERE day BETWEEN ? AND ? AND book IN (${books.map(() => '?').join(',')}))`,
      c.start_day,
      c.end_day,
      ...books
    );
    return r?.n ?? 0;
  }
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM chapter_reads WHERE day BETWEEN ? AND ?',
    c.start_day,
    c.end_day
  );
  return r?.n ?? 0;
}

const MILESTONES = [0.25, 0.5, 0.75];

/** Recomputes your progress in every challenge you're in and shares it (plus milestone posts). */
export async function updateChallengeProgress(db: SQLiteDatabase) {
  const hub = getHub();
  if (!hub) return;
  const mine = await myMemberships();
  if (!mine.length) return;
  const challenges = await listChallenges();
  for (const m of mine) {
    const c = challenges.find((x) => x.id === m.challenge);
    if (!c) continue;
    const target = challengeTarget(c);
    const progress = Math.min(target, await localProgress(db, c));
    if (progress === m.progress) continue;
    const done = progress >= target;
    await hubFetch(`/api/collections/challenge_members/records/${m.id}`, { method: 'PATCH', body: { progress, done } });
    const before = m.progress / target;
    const after = progress / target;
    if (done && !m.done) {
      await postActivity(c.id, 'completed', `${hub.user.name} completed the challenge! 🏁`);
    } else {
      const crossed = MILESTONES.filter((ms) => before < ms && after >= ms).pop();
      if (crossed) await postActivity(c.id, 'progress', `${hub.user.name} is ${Math.round(crossed * 100)}% there (${progress}/${target})`);
    }
  }
  notify('social');
}
