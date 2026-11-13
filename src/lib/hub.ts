import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { getT } from '@/i18n';
import { notify } from './db';

/** Connection to your Lámpara hub (PocketBase on your ZimaOS). */
export type HubUser = { id: string; name: string; email: string; friend_code: string };
export type HubState = { url: string; token: string; user: HubUser } | null;

const KEY = 'hub.v1';
// The last hub address used on this device (kept after signing out, so it doesn't have to be typed again).
const LAST_URL_KEY = 'hub.lastUrl';

const store = {
  get(): string | null {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return Storage.getItemSync(KEY);
  },
  set(v: string | null) {
    if (Platform.OS === 'web') {
      if (v === null) globalThis.localStorage?.removeItem(KEY);
      else globalThis.localStorage?.setItem(KEY, v);
    } else if (v === null) Storage.removeItemSync(KEY);
    else Storage.setItemSync(KEY, v);
  },
};

let state: HubState = (() => {
  try {
    const raw = store.get();
    return raw ? (JSON.parse(raw) as HubState) : null;
  } catch {
    return null;
  }
})();
const listeners = new Set<() => void>();

function setState(next: HubState) {
  state = next;
  if (next) rememberUrl(next.url);
  try {
    store.set(next ? JSON.stringify(next) : null);
  } catch {
    // keep in memory
  }
  listeners.forEach((l) => l());
  notify('hub');
}

export function getHub() {
  return state;
}

export function useHub(): HubState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state
  );
}

export class HubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * On the website served by the hub itself, the hub is the same address as the page.
 * (Not during development, where the page comes from the Expo dev server on port 8081.)
 */
export function defaultHubUrl() {
  if (Platform.OS === 'web' && typeof location !== 'undefined' && location.port !== '8081') return location.origin;
  return lastHubUrl();
}

/** Last hub address used here (or one that came with an invitation link). */
export function lastHubUrl(): string {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(LAST_URL_KEY) ?? '';
    return Storage.getItemSync(LAST_URL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberUrl(url: string) {
  const u = normalizeUrl(url);
  if (!u) return;
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(LAST_URL_KEY, u);
    else Storage.setItemSync(LAST_URL_KEY, u);
  } catch {
    // not important
  }
}

export function normalizeUrl(url: string) {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

/** Turns the hub's (English, technical) error replies into plain words in the app's language. */
function friendly(path: string, status: number, json: unknown): string {
  const { t } = getT();
  const j = json as { message?: string; data?: Record<string, { code?: string; message?: string }> } | null;
  const msg = j?.message ?? '';
  const fields = j?.data ?? {};
  if (path.includes('auth-with-password') && status === 400) return t('err.badLogin');
  if (/invite code is required/i.test(msg)) return t('err.inviteNeeded');
  if (/invite code is not valid/i.test(msg)) return t('err.inviteBad');
  if (fields.email?.code === 'validation_not_unique' || /already (in use|exists)/i.test(fields.email?.message ?? '')) return t('err.emailTaken');
  if (fields.email) return t('err.emailBad');
  if (fields.password) return t('err.passwordShort');
  if (/reset code is not right/i.test(msg)) return t('err.resetBad');
  if (/at least 8/i.test(msg)) return t('err.passwordShort');
  if (/No one on this hub uses that email/i.test(msg)) return t('err.noEmail');
  if (status === 401) return t('err.signedOut');
  if (status === 403) return t('err.notAllowed');
  if (status >= 500) return t('err.server');
  return messageFrom(json, t('err.server'));
}

function messageFrom(json: unknown, fallback: string) {
  const j = json as { message?: string; data?: Record<string, { message?: string }> } | null;
  const fieldMsgs = j?.data ? Object.entries(j.data).map(([k, v]) => `${k}: ${v?.message ?? 'invalid'}`) : [];
  if (fieldMsgs.length) return fieldMsgs.join('\n');
  return j?.message || fallback;
}

/** Low-level request to the hub (adds the login token). */
export async function hubFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; url?: string; token?: string | null } = {}
): Promise<T> {
  const base = opts.url ?? state?.url;
  if (!base) throw new HubError('Not connected to a hub.', 0);
  const token = opts.token === undefined ? state?.token : opts.token;
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new HubError(getT().t('err.offline'), 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && state && token === state.token) {
      // Session expired: sign out locally.
      setState(null);
    }
    throw new HubError(friendly(path, res.status, json), res.status);
  }
  return json as T;
}

type AuthResponse = { token: string; record: HubUser };

export async function signIn(url: string, email: string, password: string) {
  const u = normalizeUrl(url);
  const res = await hubFetch<AuthResponse>('/api/collections/users/auth-with-password', {
    url: u,
    token: null,
    method: 'POST',
    body: { identity: email.trim(), password },
  });
  setState({ url: u, token: res.token, user: pickUser(res.record) });
}

export async function signUp(url: string, name: string, email: string, password: string, invite: string) {
  const u = normalizeUrl(url);
  const q = invite.trim() ? `?invite=${encodeURIComponent(invite.trim())}` : '';
  await hubFetch(`/api/collections/users/records${q}`, {
    url: u,
    token: null,
    method: 'POST',
    body: { name: name.trim(), email: email.trim(), password, passwordConfirm: password },
  });
  await signIn(u, email, password);
}

/** Forgot password: choose a new one with the code from the hub owner. */
export async function resetPassword(url: string, email: string, code: string, password: string) {
  const u = normalizeUrl(url);
  await hubFetch('/api/lampara/reset-password', {
    url: u,
    token: null,
    method: 'POST',
    body: { email: email.trim(), code: code.trim(), password },
  });
  await signIn(u, email, password);
}

/** Hub owner: make a one-time password reset code for a member. */
export function makeResetCode(email: string) {
  return hubFetch<{ code: string; name: string }>('/api/lampara/reset-code', { method: 'POST', body: { email: email.trim() } });
}

/** Refreshes the token (and the user's name / friend code). */
export async function refreshAuth() {
  if (!state) return;
  const res = await hubFetch<AuthResponse>('/api/collections/users/auth-refresh', { method: 'POST' });
  setState({ url: state.url, token: res.token, user: pickUser(res.record) });
}

export function signOut() {
  setState(null);
}

function pickUser(r: HubUser): HubUser {
  return { id: r.id, name: r.name, email: r.email, friend_code: r.friend_code };
}

/** Builds a PocketBase list URL. */
export function listPath(collection: string, params: { filter?: string; sort?: string; expand?: string; perPage?: number } = {}) {
  const q = new URLSearchParams();
  if (params.filter) q.set('filter', params.filter);
  if (params.sort) q.set('sort', params.sort);
  if (params.expand) q.set('expand', params.expand);
  q.set('perPage', String(params.perPage ?? 200));
  return `/api/collections/${collection}/records?${q.toString()}`;
}

/** Quote a value for a PocketBase filter string. */
export function pbq(v: string) {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
