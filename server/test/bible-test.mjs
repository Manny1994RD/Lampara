// Checks the Bible routes. Usage:
//   node server/test/bible-test.mjs http://127.0.0.1:8090 owner@test.local member@test.local password
// The first email must be the hub owner (first account), the second any other member.
// Uses a tiny made-up "Bible" (not real Scripture text) and deletes it at the end.
const [BASE = 'http://127.0.0.1:8090', OWNER, MEMBER, PW = 'test-password-123'] = process.argv.slice(2);
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
  return { status: res.status, json: await res.json().catch(() => null) };
}
const login = async (email) =>
  (await api('/api/collections/users/auth-with-password', { method: 'POST', body: { identity: email, password: PW } })).json?.token;

const owner = await login(OWNER);
const member = await login(MEMBER);
ok(!!owner && !!member, 'both accounts log in');

const id = `test-${Date.now().toString(36)}`;
const meta = { id, name: 'Test Bible', abbr: 'TST', lang: 'en', comments: '', has_ot: 1, has_nt: 1 };

let r = await api('/api/lampara/bibles');
ok(r.status === 401, `list needs sign-in (${r.status})`);
r = await api('/api/lampara/bibles', { method: 'POST', token: member, body: meta });
ok(r.status === 403, `member can't upload (${r.status})`);
r = await api('/api/lampara/bibles', { method: 'POST', token: owner, body: meta });
ok(r.status === 200, `owner starts upload (${r.status} ${r.json?.message ?? ''})`);

const verses = [
  [1, 1, 1, 'Alpha line one', 'alpha line one', '', 1],
  [1, 1, 2, 'Beta line two', 'beta line two', '[{"s":0,"e":4,"t":"i"}]', 0],
  [1, 2, 1, 'Gamma second chapter', 'gamma second chapter', '', 0],
  [43, 3, 16, 'Delta in the new part', 'delta in the new part', '', 0],
];
r = await api(`/api/lampara/bibles/${id}/verses`, { method: 'POST', token: owner, body: { verses } });
ok(r.status === 200, `owner uploads verses (${r.status} ${r.json?.message ?? ''})`);

r = await api('/api/lampara/bibles', { token: member });
ok(!r.json?.items?.some((b) => b.id === id), 'unfinished upload is hidden');
r = await api(`/api/lampara/bibles/${id}/finish`, { method: 'POST', token: owner });
ok(r.json?.verse_count === 4, `finish counts verses (${r.json?.verse_count})`);

r = await api('/api/lampara/bibles', { token: member });
ok(r.json?.items?.some((b) => b.id === id && b.verse_count === 4), 'member sees the Bible');
ok(r.json?.can_manage === false, 'member is not a manager');
r = await api('/api/lampara/bibles', { token: owner });
ok(r.json?.can_manage === true, 'owner is the manager');

r = await api(`/api/lampara/bibles/${id}/text?book=1&ch=1`, { token: member });
ok(r.json?.verses?.length === 2 && r.json.verses[1].marks.includes('"i"') && r.json.verses[0].para === 1, 'chapter with marks and paragraphs');
r = await api(`/api/lampara/bibles/${id}/text?book=1`, { token: member });
ok(r.json?.verses?.length === 3, `whole book (${r.json?.verses?.length})`);
r = await api(`/api/lampara/bibles/${id}/lookup`, { method: 'POST', token: member, body: { refs: [[43, 3, 16], [1, 1, 9]] } });
ok(r.json?.verses?.length === 1 && r.json.verses[0].text.startsWith('Delta'), 'lookup finds existing verses only');
r = await api(`/api/lampara/bibles/${id}/search?words=line&scope=all`, { token: member });
ok(r.json?.verses?.length === 2, `search (${r.json?.verses?.length})`);
r = await api(`/api/lampara/bibles/${id}/search?words=delta&scope=OT`, { token: member });
ok(r.json?.verses?.length === 0, 'search scope OT');
r = await api(`/api/lampara/bibles/${id}/search?words=${encodeURIComponent("%' OR 1=1 --")}`, { token: member });
ok(r.status === 200 && r.json?.verses?.length === 0, 'search is injection-safe');

r = await api('/api/lampara/bibles', { method: 'POST', token: owner, body: { ...meta, id: `${id}-2` } });
ok(r.status === 400, `same name+abbr refused (${r.status})`);

r = await api(`/api/lampara/bibles/${id}`, { method: 'DELETE', token: member });
ok(r.status === 403, `member can't delete (${r.status})`);
r = await api(`/api/lampara/bibles/${id}`, { method: 'DELETE', token: owner });
ok(r.status === 200, 'owner deletes');
r = await api(`/api/lampara/bibles/${id}/text?book=1&ch=1`, { token: member });
ok(r.json?.verses?.length === 0, 'verses gone after delete');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
