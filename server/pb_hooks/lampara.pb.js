/// <reference path="../pb_data/types.d.ts" />
// Server logic for the Lámpara hub.
// Note: PocketBase runs each handler in isolation, so helpers live inside the handlers.

// ---------------------------------------------------------------------------
// Invite-only sign up. The very first account (the hub owner) doesn't need one.
// The app sends the code as ?invite=CODE ('invite' is a hidden field, so it's
// stripped from the request body).
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const total = e.app.countRecords('users');
  const info = e.requestInfo();
  const code = String((info.query && info.query.invite) || '').trim().toUpperCase();
  let invite = null;

  if (total > 0) {
    if (!code) throw new BadRequestError('An invite code is required to join this Lámpara hub.');
    try {
      invite = e.app.findFirstRecordByFilter('invites', "code = {:code} && used_by = ''", { code: code });
    } catch (_) {
      throw new BadRequestError('That invite code is not valid or was already used.');
    }
  }

  // Everyone gets a short friend code to share.
  if (!e.record.get('friend_code')) {
    e.record.set('friend_code', $security.randomStringWithAlphabet(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'));
  }
  e.record.set('invite', code);

  e.next();

  if (invite) {
    invite.set('used_by', e.record.id);
    e.app.save(invite);
  }
}, 'users');

// ---------------------------------------------------------------------------
// Sync: push your changes and pull everything changed since your last sync.
// POST /api/lampara/sync  { push: [{kind, item_id, data, deleted}], cursor: number }
// Every saved change gets the next number of a global counter (seq), so
// "everything after my cursor" never misses anything.
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/api/lampara/sync',
  (e) => {
    const PAGE = 500;
    const KINDS = ['reads', 'highlights', 'bookmarks', 'notes', 'topics', 'topic_verses', 'plans'];
    const userId = e.auth.id;
    const body = e.requestInfo().body || {};
    const push = Array.isArray(body.push) ? body.push : [];
    if (push.length > 1000) throw new BadRequestError('Too many changes in one request (max 1000).');

    if (push.length) {
      e.app.runInTransaction((tx) => {
        const col = tx.findCollectionByNameOrId('sync_items');
        const top = tx.findRecordsByFilter('sync_items', 'seq > 0', '-seq', 1, 0);
        let seq = top.length && top[0] ? top[0].getInt('seq') : 0;
        for (const it of push) {
          const kind = String(it.kind || '');
          const itemId = String(it.item_id || '');
          if (KINDS.indexOf(kind) < 0 || !itemId || itemId.length > 80) continue;
          let rec = null;
          try {
            rec = tx.findFirstRecordByFilter(
              'sync_items',
              'user = {:u} && kind = {:k} && item_id = {:i}',
              { u: userId, k: kind, i: itemId }
            );
          } catch (_) {
            rec = new Record(col);
            rec.set('user', userId);
            rec.set('kind', kind);
            rec.set('item_id', itemId);
          }
          seq++;
          rec.set('seq', seq);
          rec.set('deleted', !!it.deleted);
          rec.set('data', it.deleted ? null : it.data);
          tx.save(rec);
        }
      });
    }

    const cursor = Number(body.cursor) || 0;
    const recs = e.app.findRecordsByFilter('sync_items', 'user = {:u} && seq > {:c}', 'seq', PAGE, 0, {
      u: userId,
      c: cursor,
    });
    const items = [];
    let last = cursor;
    for (const r of recs) {
      if (!r) continue;
      items.push({ kind: r.get('kind'), item_id: r.get('item_id'), data: r.get('data'), deleted: r.get('deleted') });
      last = r.getInt('seq');
    }
    return e.json(200, { items: items, cursor: last, more: recs.length === PAGE });
  },
  $apis.requireAuth('users')
);
