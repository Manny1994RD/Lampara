// End-to-end check of the hub API. Usage: node server/test/api-test.mjs http://127.0.0.1:8090
// Uses throwaway accounts; run it only against a fresh test server.
const BASE = process.argv[2] || 'http://127.0.0.1:8090';
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const pw = 'test-password-123';
const signup = (email, name, invite) =>
  api(`/api/collections/users/records${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`, {
    method: 'POST',
    body: { email, name, password: pw, passwordConfirm: pw },
  });
const login = async (email) => (await api('/api/collections/users/auth-with-password', { method: 'POST', body: { identity: email, password: pw } })).json;

// 1. Owner signs up without an invite (first account)
let r = await signup('owner@test.local', 'Owner');
ok(r.status === 200, `first account without invite (${r.status})`);
ok(/^[A-Z2-9]{6}$/.test(r.json?.friend_code ?? ''), `friend code generated (${r.json?.friend_code})`);
const owner = await login('owner@test.local');
ok(!!owner?.token, 'owner can log in');

// 2. Second sign up without invite is refused
r = await signup('nobody@test.local', 'Nobody');
ok(r.status === 400, `sign up without invite refused (${r.status}: ${r.json?.message})`);

// 3. Owner creates an invite; friend uses it; it can't be reused
r = await api('/api/collections/invites/records', { method: 'POST', token: owner.token, body: { code: 'FRIEND01', created_by: owner.record.id } });
ok(r.status === 200, `owner creates invite (${r.status})`);
r = await signup('friend@test.local', 'Friend', 'friend01');
ok(r.status === 200, `friend signs up with invite (${r.status} ${r.json?.message ?? ''})`);
r = await signup('third@test.local', 'Third', 'FRIEND01');
ok(r.status === 400, `used invite refused (${r.status})`);
const friend = await login('friend@test.local');
r = await api('/api/collections/invites/records', { token: owner.token });
ok(r.json?.items?.[0]?.used_by === friend.record.id, 'invite marked as used by friend');

// 4. Sync: push, pull, private to each user
r = await api('/api/lampara/sync', {
  method: 'POST',
  token: owner.token,
  body: { push: [{ kind: 'reads', item_id: 'r1', data: { book: 43, ch: 3 } }, { kind: 'notes', item_id: 'n1', data: { body: 'hello' } }, { kind: 'bogus', item_id: 'x', data: {} }], cursor: 0 },
});
ok(r.status === 200 && r.json.items.length === 2, `owner sync push+pull returns 2 items (${r.status}, ${r.json?.items?.length})`);
const cursor = r.json.cursor;
r = await api('/api/lampara/sync', { method: 'POST', token: owner.token, body: { push: [], cursor } });
ok(r.json.items.length === 0, 'nothing new after cursor');
r = await api('/api/lampara/sync', { method: 'POST', token: owner.token, body: { push: [{ kind: 'notes', item_id: 'n1', deleted: true }], cursor } });
ok(r.json.items.length === 1 && r.json.items[0].deleted === true, 'deletion comes back as tombstone');
r = await api('/api/lampara/sync', { method: 'POST', token: friend.token, body: { push: [], cursor: 0 } });
ok(r.json.items.length === 0, "friend can't see owner's data");
r = await api('/api/collections/sync_items/records', { token: friend.token });
ok(r.json?.items?.length === 0, 'sync_items list is private');
r = await api('/api/lampara/sync', { method: 'POST', body: { push: [] } });
ok(r.status === 401, `sync requires login (${r.status})`);

// 5. Friends by friend code
r = await api(`/api/collections/users/records?filter=${encodeURIComponent(`friend_code='${friend.record.friend_code}'`)}`, { token: owner.token });
ok(r.json?.items?.length === 1 && !r.json.items[0].email, 'find friend by code; email hidden');
r = await api('/api/collections/friendships/records', { method: 'POST', token: owner.token, body: { from: owner.record.id, to: friend.record.id, status: 'accepted' } });
ok(r.status === 400, "can't create an already-accepted friendship");
r = await api('/api/collections/friendships/records', { method: 'POST', token: owner.token, body: { from: owner.record.id, to: friend.record.id, status: 'pending' } });
ok(r.status === 200, 'friend request sent');
const fid = r.json.id;
r = await api(`/api/collections/friendships/records/${fid}`, { method: 'PATCH', token: owner.token, body: { status: 'accepted' } });
ok(r.status === 404 || r.status === 400 || r.status === 403, `sender can't accept own request (${r.status})`);
r = await api(`/api/collections/friendships/records/${fid}`, { method: 'PATCH', token: friend.token, body: { status: 'accepted' } });
ok(r.status === 200 && r.json.status === 'accepted', 'friend accepts');

// 6. Challenges + members + activity
r = await api('/api/collections/challenges/records', {
  method: 'POST',
  token: owner.token,
  body: { owner: owner.record.id, title: 'Read 30 chapters', goal: 'chapters', target: 30, start_day: '2026-11-13', end_day: '2026-11-27' },
});
ok(r.status === 200, `challenge created (${r.status} ${r.json?.message ?? ''})`);
const cid = r.json.id;
r = await api('/api/collections/challenges/records', { token: friend.token });
ok(r.json?.items?.length === 0, "friend can't see the challenge before being added");
r = await api('/api/collections/challenge_members/records', { method: 'POST', token: owner.token, body: { challenge: cid, user: owner.record.id, progress: 0 } });
ok(r.status === 200, 'owner joins');
r = await api('/api/collections/challenge_members/records', { method: 'POST', token: owner.token, body: { challenge: cid, user: friend.record.id, progress: 0 } });
ok(r.status === 200, 'owner adds friend');
const friendMember = r.json.id;
r = await api('/api/collections/challenges/records', { token: friend.token });
ok(r.json?.items?.length === 1, 'friend now sees the challenge');
r = await api(`/api/collections/challenge_members/records?filter=${encodeURIComponent(`challenge='${cid}'`)}`, { token: friend.token });
ok(r.json?.items?.length === 2, 'members see each other (leaderboard)');
r = await api(`/api/collections/challenge_members/records/${friendMember}`, { method: 'PATCH', token: owner.token, body: { progress: 99 } });
ok(r.status !== 200, `owner can't change friend's progress (${r.status})`);
r = await api(`/api/collections/challenge_members/records/${friendMember}`, { method: 'PATCH', token: friend.token, body: { progress: 7 } });
ok(r.status === 200 && r.json.progress === 7, 'friend updates own progress');
r = await api('/api/collections/activity/records', { method: 'POST', token: friend.token, body: { challenge: cid, user: friend.record.id, target: owner.record.id, kind: 'cheer', emoji: '🔥', text: 'Vamos!' } });
ok(r.status === 200, 'friend sends a cheer');
r = await api(`/api/collections/activity/records?filter=${encodeURIComponent(`challenge='${cid}'`)}&expand=user`, { token: owner.token });
ok(r.json?.items?.length === 1 && r.json.items[0].expand?.user?.name === 'Friend', 'owner sees the cheer with sender name');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
