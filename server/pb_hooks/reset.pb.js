/// <reference path="../pb_data/types.d.ts" />
// Forgot password: the hub owner makes a one-time code (valid 2 days); the member enters it with
// a new password. (Used instead of reset emails, which need an email server.)

/** Owner only: POST /api/lampara/reset-code {email} -> {code, name} */
routerAdd(
  'POST',
  '/api/lampara/reset-code',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can make reset codes.');
    }
    const email = String((e.requestInfo().body || {}).email || '').trim().toLowerCase();
    let user;
    try {
      user = e.app.findAuthRecordByEmail('users', email);
    } catch (_) {
      throw new NotFoundError('No one on this hub uses that email.');
    }
    const code = $security.randomStringWithAlphabet(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    const expires = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    e.app
      .db()
      .newQuery(
        'INSERT OR REPLACE INTO lampara_resets (email, code_hash, expires, attempts) VALUES ({:email}, {:hash}, {:expires}, 0)'
      )
      .bind({ email: email, hash: $security.sha256(code), expires: expires })
      .execute();
    return e.json(200, { code: code, name: user.getString('name') });
  },
  $apis.requireAuth('users')
);

/** Anyone: POST /api/lampara/reset-password {email, code, password} */
routerAdd('POST', '/api/lampara/reset-password', (e) => {
  const b = e.requestInfo().body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').trim().toUpperCase();
  const password = String(b.password || '');
  if (password.length < 8) throw new BadRequestError('The new password needs at least 8 characters.');

  const rows = arrayOf(new DynamicModel({ code_hash: '', expires: '', attempts: 0 }));
  e.app
    .db()
    .newQuery('SELECT code_hash, expires, attempts FROM lampara_resets WHERE email = {:email}')
    .bind({ email: email })
    .all(rows);
  const r = rows.length ? rows[0] : null;
  const bad = () => new BadRequestError('That reset code is not right or has expired.');
  if (!r || r.attempts >= 5 || r.expires < new Date().toISOString()) throw bad();
  if (r.code_hash !== $security.sha256(code)) {
    e.app.db().newQuery('UPDATE lampara_resets SET attempts = attempts + 1 WHERE email = {:email}').bind({ email: email }).execute();
    throw bad();
  }
  const user = e.app.findAuthRecordByEmail('users', email);
  user.setPassword(password);
  e.app.save(user);
  e.app.db().newQuery('DELETE FROM lampara_resets WHERE email = {:email}').bind({ email: email }).execute();
  return e.json(200, { ok: true });
});
