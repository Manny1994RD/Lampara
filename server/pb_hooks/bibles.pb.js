/// <reference path="../pb_data/types.d.ts" />
// Bibles on the hub.
//   Reading: any member of your hub (signed in).
//   Uploading / deleting: only the hub owner (the first account created).
// Note: PocketBase runs each handler in isolation, so helpers are repeated inside the handlers.

// List the Bibles on the hub.
routerAdd(
  'GET',
  '/api/lampara/bibles',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    const isOwner = !!(first.length && first[0] && first[0].id === e.auth.id);
    const rows = arrayOf(
      new DynamicModel({ id: '', name: '', abbr: '', lang: '', comments: '', verse_count: 0, has_ot: 0, has_nt: 0 })
    );
    e.app
      .db()
      .newQuery(
        'SELECT id, name, abbr, lang, comments, verse_count, has_ot, has_nt FROM lampara_bibles WHERE complete = 1 ORDER BY lang, name'
      )
      .all(rows);
    return e.json(200, { items: rows, can_manage: isOwner });
  },
  $apis.requireAuth('users')
);

// Start an upload: POST { id, name, abbr, lang, comments, has_ot, has_nt }
routerAdd(
  'POST',
  '/api/lampara/bibles',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can add Bibles.');
    }
    const b = e.requestInfo().body || {};
    const id = String(b.id || '');
    const name = String(b.name || '').trim().slice(0, 200);
    const abbr = String(b.abbr || '').trim().slice(0, 40);
    const lang = ['en', 'es', 'ko'].indexOf(b.lang) >= 0 ? b.lang : 'en';
    if (!/^[a-z0-9-]{6,40}$/.test(id)) throw new BadRequestError('Invalid Bible id.');
    if (!name || !abbr) throw new BadRequestError('A Bible needs a name and an abbreviation.');

    const same = arrayOf(new DynamicModel({ id: '' }));
    e.app
      .db()
      .newQuery('SELECT id FROM lampara_bibles WHERE name = {:name} AND abbr = {:abbr} AND id != {:id} AND complete = 1')
      .bind({ name: name, abbr: abbr, id: id })
      .all(same);
    if (same.length) throw new BadRequestError(abbr + ' is already on your hub.');

    e.app.runInTransaction((tx) => {
      tx.db().newQuery('DELETE FROM lampara_verses WHERE bible = {:id}').bind({ id: id }).execute();
      tx.db()
        .newQuery(
          `INSERT OR REPLACE INTO lampara_bibles (id, name, abbr, lang, comments, verse_count, has_ot, has_nt, complete, uploaded_by, created)
           VALUES ({:id}, {:name}, {:abbr}, {:lang}, {:comments}, 0, {:ot}, {:nt}, 0, {:by}, {:created})`
        )
        .bind({
          id: id,
          name: name,
          abbr: abbr,
          lang: lang,
          comments: String(b.comments || '').slice(0, 2000),
          ot: b.has_ot ? 1 : 0,
          nt: b.has_nt ? 1 : 0,
          by: e.auth.id,
          created: new Date().toISOString(),
        })
        .execute();
    });
    return e.json(200, { id: id });
  },
  $apis.requireAuth('users')
);

// Upload a batch of verses: POST { verses: [[book, ch, v, text, norm, marks, para], ...] }
routerAdd(
  'POST',
  '/api/lampara/bibles/{id}/verses',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can add Bibles.');
    }
    const id = e.request.pathValue('id');
    const exists = arrayOf(new DynamicModel({ id: '' }));
    e.app.db().newQuery('SELECT id FROM lampara_bibles WHERE id = {:id}').bind({ id: id }).all(exists);
    if (!exists.length) throw new NotFoundError('That Bible upload was not started.');

    const verses = (e.requestInfo().body || {}).verses;
    if (!Array.isArray(verses) || verses.length > 5000) throw new BadRequestError('Send 1 to 5000 verses at a time.');

    e.app.runInTransaction((tx) => {
      const q = tx
        .db()
        .newQuery(
          `INSERT OR REPLACE INTO lampara_verses (bible, book, ch, v, text, norm, marks, para)
           VALUES ({:bible}, {:book}, {:ch}, {:v}, {:text}, {:norm}, {:marks}, {:para})`
        );
      for (const r of verses) {
        if (!Array.isArray(r)) continue;
        const book = Number(r[0]);
        const ch = Number(r[1]);
        const v = Number(r[2]);
        if (!(book >= 1 && book <= 66 && ch >= 1 && ch <= 200 && v >= 0 && v <= 200)) continue;
        q.bind({
          bible: id,
          book: book,
          ch: ch,
          v: v,
          text: String(r[3] || ''),
          norm: String(r[4] || ''),
          marks: r[5] ? String(r[5]) : '',
          para: r[6] ? 1 : 0,
        }).execute();
      }
    });
    return e.json(200, { ok: true });
  },
  $apis.requireAuth('users')
);

// Finish an upload: the Bible becomes visible to every device.
routerAdd(
  'POST',
  '/api/lampara/bibles/{id}/finish',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can add Bibles.');
    }
    const id = e.request.pathValue('id');
    const c = new DynamicModel({ n: 0 });
    e.app.db().newQuery('SELECT COUNT(*) AS n FROM lampara_verses WHERE bible = {:id}').bind({ id: id }).one(c);
    if (!c.n) throw new BadRequestError('No verses were uploaded.');
    e.app
      .db()
      .newQuery('UPDATE lampara_bibles SET verse_count = {:n}, complete = 1 WHERE id = {:id}')
      .bind({ n: c.n, id: id })
      .execute();
    return e.json(200, { id: id, verse_count: c.n });
  },
  $apis.requireAuth('users')
);

// Delete a Bible from the hub.
routerAdd(
  'DELETE',
  '/api/lampara/bibles/{id}',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can remove Bibles.');
    }
    const id = e.request.pathValue('id');
    e.app.runInTransaction((tx) => {
      tx.db().newQuery('DELETE FROM lampara_verses WHERE bible = {:id}').bind({ id: id }).execute();
      tx.db().newQuery('DELETE FROM lampara_bibles WHERE id = {:id}').bind({ id: id }).execute();
    });
    return e.json(200, { ok: true });
  },
  $apis.requireAuth('users')
);

// Read a chapter (?book=43&ch=3) or a whole book (?book=43).
routerAdd(
  'GET',
  '/api/lampara/bibles/{id}/text',
  (e) => {
    const id = e.request.pathValue('id');
    const query = e.request.url.query();
    const book = parseInt(query.get('book'), 10);
    const ch = parseInt(query.get('ch'), 10);
    if (!(book >= 1 && book <= 66)) throw new BadRequestError('Invalid book.');
    const rows = arrayOf(new DynamicModel({ book: 0, ch: 0, v: 0, text: '', norm: '', marks: '', para: 0 }));
    if (ch > 0) {
      e.app
        .db()
        .newQuery(
          'SELECT book, ch, v, text, norm, marks, para FROM lampara_verses WHERE bible = {:id} AND book = {:book} AND ch = {:ch} ORDER BY v'
        )
        .bind({ id: id, book: book, ch: ch })
        .all(rows);
    } else {
      e.app
        .db()
        .newQuery(
          'SELECT book, ch, v, text, norm, marks, para FROM lampara_verses WHERE bible = {:id} AND book = {:book} ORDER BY ch, v'
        )
        .bind({ id: id, book: book })
        .all(rows);
    }
    return e.json(200, { verses: rows });
  },
  $apis.requireAuth('users')
);

// Look up single verses: POST { refs: [[book, ch, v], ...] } (max 500)
routerAdd(
  'POST',
  '/api/lampara/bibles/{id}/lookup',
  (e) => {
    const id = e.request.pathValue('id');
    const refs = (e.requestInfo().body || {}).refs;
    if (!Array.isArray(refs) || refs.length > 500) throw new BadRequestError('Send up to 500 verse references.');
    const out = [];
    const q = e.app
      .db()
      .newQuery('SELECT book, ch, v, text FROM lampara_verses WHERE bible = {:id} AND book = {:book} AND ch = {:ch} AND v = {:v}');
    for (const r of refs) {
      if (!Array.isArray(r)) continue;
      const row = new DynamicModel({ book: 0, ch: 0, v: 0, text: '' });
      try {
        q.bind({ id: id, book: Number(r[0]), ch: Number(r[1]), v: Number(r[2]) }).one(row);
        out.push(row);
      } catch (_) {
        // not in this Bible
      }
    }
    return e.json(200, { verses: out });
  },
  $apis.requireAuth('users')
);

// Search: ?words=amor dios&scope=all|OT|NT&limit=300 (words are already normalized by the app)
routerAdd(
  'GET',
  '/api/lampara/bibles/{id}/search',
  (e) => {
    const id = e.request.pathValue('id');
    const query = e.request.url.query();
    const words = String(query.get('words') || '')
      .split(/\s+/)
      .map((w) => w.replace(/[%_]/g, ''))
      .filter((w) => !!w)
      .slice(0, 8);
    if (!words.length) return e.json(200, { verses: [] });
    const scope = query.get('scope');
    const limit = Math.min(500, Math.max(1, parseInt(query.get('limit'), 10) || 300));
    const params = { id: id };
    const where = words
      .map((w, i) => {
        params['w' + i] = '%' + w + '%';
        return 'norm LIKE {:w' + i + '}';
      })
      .join(' AND ');
    const scopeSql = scope === 'OT' ? ' AND book <= 39' : scope === 'NT' ? ' AND book >= 40' : '';
    const rows = arrayOf(new DynamicModel({ book: 0, ch: 0, v: 0, text: '' }));
    e.app
      .db()
      .newQuery(
        'SELECT book, ch, v, text FROM lampara_verses WHERE bible = {:id} AND ' +
          where +
          scopeSql +
          ' ORDER BY book, ch, v LIMIT ' +
          limit
      )
      .bind(params)
      .all(rows);
    return e.json(200, { verses: rows });
  },
  $apis.requireAuth('users')
);
