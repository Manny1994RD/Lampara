/// <reference path="../pb_data/types.d.ts" />
// Commentaries, study notes and cross-references in the church library.
//   Reading (any signed-in member): list them, and get everything written about one verse.
//   Adding / removing: only the owner (the hub's first account), like Bibles.
// Note: PocketBase runs each handler in isolation, so the owner check is repeated in each one.

/** List: GET /api/lampara/commentaries -> { items, can_manage } */
routerAdd(
  'GET',
  '/api/lampara/commentaries',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    const isOwner = !!(first.length && first[0] && first[0].id === e.auth.id);
    const rows = arrayOf(new DynamicModel({ id: '', name: '', abbr: '', lang: '', kind: '', comments: '', entries: 0 }));
    e.app
      .db()
      .newQuery("SELECT id, name, abbr, lang, kind, comments, entries FROM lampara_commentaries WHERE complete = 1 AND kind != 'commentary' ORDER BY kind, lang, name")
      .all(rows);
    return e.json(200, { items: rows, can_manage: isOwner });
  },
  $apis.requireAuth('users')
);

/** Start an upload: POST { id, name, abbr, lang, kind, comments } */
routerAdd(
  'POST',
  '/api/lampara/commentaries',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can add commentaries.');
    }
    const b = e.requestInfo().body || {};
    const id = String(b.id || '');
    const name = String(b.name || '').trim().slice(0, 200);
    const abbr = String(b.abbr || '').trim().slice(0, 40);
    const lang = ['en', 'es', 'ko'].indexOf(b.lang) >= 0 ? b.lang : 'en';
    // Only cross-references and a version's notes (footnotes); full commentaries aren't kept.
    if (['refs', 'notes'].indexOf(b.kind) < 0) throw new BadRequestError('Only references and notes can be added.');
    const kind = b.kind;
    if (!/^[a-z0-9-]{6,40}$/.test(id)) throw new BadRequestError('Invalid id.');
    if (!name) throw new BadRequestError('A commentary needs a name.');

    // Importing the same commentary again replaces it.
    const same = arrayOf(new DynamicModel({ id: '' }));
    e.app.db().newQuery('SELECT id FROM lampara_commentaries WHERE name = {:name} AND id != {:id}').bind({ name: name, id: id }).all(same);
    e.app.runInTransaction((tx) => {
      for (const s of same) {
        tx.db().newQuery('DELETE FROM lampara_comments WHERE cm = {:id}').bind({ id: s.id }).execute();
        tx.db().newQuery('DELETE FROM lampara_commentaries WHERE id = {:id}').bind({ id: s.id }).execute();
      }
      tx.db().newQuery('DELETE FROM lampara_comments WHERE cm = {:id}').bind({ id: id }).execute();
      tx.db()
        .newQuery(
          `INSERT OR REPLACE INTO lampara_commentaries (id, name, abbr, lang, kind, comments, entries, complete, uploaded_by, created)
           VALUES ({:id}, {:name}, {:abbr}, {:lang}, {:kind}, {:comments}, 0, 0, {:by}, {:created})`
        )
        .bind({
          id: id,
          name: name,
          abbr: abbr || name.slice(0, 8),
          lang: lang,
          kind: kind,
          comments: String(b.comments || '').slice(0, 2000),
          by: e.auth.id,
          created: new Date().toISOString(),
        })
        .execute();
    });
    return e.json(200, { id: id });
  },
  $apis.requireAuth('users')
);

/** Upload a batch: POST { entries: [[book, ch1, v1, ch2, v2, text, marks], ...] } */
routerAdd(
  'POST',
  '/api/lampara/commentaries/{id}/entries',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can add commentaries.');
    }
    const id = e.request.pathValue('id');
    const exists = arrayOf(new DynamicModel({ id: '' }));
    e.app.db().newQuery('SELECT id FROM lampara_commentaries WHERE id = {:id}').bind({ id: id }).all(exists);
    if (!exists.length) throw new NotFoundError('That upload was not started.');
    const entries = (e.requestInfo().body || {}).entries;
    if (!Array.isArray(entries) || entries.length > 3000) throw new BadRequestError('Send 1 to 3000 entries at a time.');
    e.app.runInTransaction((tx) => {
      const q = tx
        .db()
        .newQuery(
          `INSERT INTO lampara_comments (cm, book, ch1, v1, ch2, v2, text, marks)
           VALUES ({:cm}, {:book}, {:ch1}, {:v1}, {:ch2}, {:v2}, {:text}, {:marks})`
        );
      for (const r of entries) {
        if (!Array.isArray(r)) continue;
        const book = Number(r[0]);
        const ch1 = Number(r[1]);
        const v1 = Number(r[2]);
        const ch2 = Number(r[3]);
        const v2 = Number(r[4]);
        const text = String(r[5] || '');
        if (!(book >= 1 && book <= 66 && ch1 >= 1 && ch2 >= ch1 && ch2 <= 200 && v1 >= 0 && v2 >= 0 && v2 <= 999) || !text) continue;
        q.bind({ cm: id, book: book, ch1: ch1, v1: v1, ch2: ch2, v2: v2, text: text.slice(0, 200000), marks: r[6] ? String(r[6]) : '' }).execute();
      }
    });
    return e.json(200, { ok: true });
  },
  $apis.requireAuth('users')
);

/** Finish an upload: the commentary becomes visible to everyone. */
routerAdd(
  'POST',
  '/api/lampara/commentaries/{id}/finish',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can add commentaries.');
    }
    const id = e.request.pathValue('id');
    const c = new DynamicModel({ n: 0 });
    e.app.db().newQuery('SELECT COUNT(*) AS n FROM lampara_comments WHERE cm = {:id}').bind({ id: id }).one(c);
    if (!c.n) throw new BadRequestError('Nothing was uploaded.');
    e.app.db().newQuery('UPDATE lampara_commentaries SET entries = {:n}, complete = 1 WHERE id = {:id}').bind({ n: c.n, id: id }).execute();
    return e.json(200, { id: id, entries: c.n });
  },
  $apis.requireAuth('users')
);

/** Remove a commentary from the library. */
routerAdd(
  'DELETE',
  '/api/lampara/commentaries/{id}',
  (e) => {
    const first = e.app.findRecordsByFilter('users', "id != ''", 'created', 1, 0);
    if (!(first.length && first[0] && first[0].id === e.auth.id)) {
      throw new ForbiddenError('Only the owner of this hub can remove commentaries.');
    }
    const id = e.request.pathValue('id');
    e.app.runInTransaction((tx) => {
      tx.db().newQuery('DELETE FROM lampara_comments WHERE cm = {:id}').bind({ id: id }).execute();
      tx.db().newQuery('DELETE FROM lampara_commentaries WHERE id = {:id}').bind({ id: id }).execute();
    });
    return e.json(200, { ok: true });
  },
  $apis.requireAuth('users')
);

/** Everything about one verse: GET /api/lampara/notes?book=43&ch=3&v=16 -> { items } */
routerAdd(
  'GET',
  '/api/lampara/notes',
  (e) => {
    const q = e.request.url.query();
    const book = parseInt(q.get('book'), 10);
    const ch = parseInt(q.get('ch'), 10);
    const v = parseInt(q.get('v'), 10);
    if (!(book >= 1 && book <= 66 && ch >= 1 && v >= 1)) throw new BadRequestError('Invalid verse.');
    const rows = arrayOf(
      new DynamicModel({ cm: '', name: '', abbr: '', kind: '', lang: '', ch1: 0, v1: 0, ch2: 0, v2: 0, text: '', marks: '' })
    );
    // Notes whose passage (ch1:v1 – ch2:v2) contains this verse. v1 = 0 means "from the start of the chapter".
    e.app
      .db()
      .newQuery(
        `SELECT n.cm AS cm, c.name AS name, c.abbr AS abbr, c.kind AS kind, c.lang AS lang,
                n.ch1 AS ch1, n.v1 AS v1, n.ch2 AS ch2, n.v2 AS v2, n.text AS text, n.marks AS marks
           FROM lampara_comments n JOIN lampara_commentaries c ON c.id = n.cm
          WHERE c.complete = 1 AND c.kind != 'commentary' AND n.book = {:book} AND n.ch1 <= {:ch} AND n.ch2 >= {:ch}
            AND (n.ch1 < {:ch} OR n.v1 <= {:v})
            AND (n.ch2 > {:ch} OR n.v2 >= {:v})
          ORDER BY CASE c.kind WHEN 'refs' THEN 0 WHEN 'notes' THEN 1 ELSE 2 END, c.name, n.ch1, n.v1
          LIMIT 80`
      )
      .bind({ book: book, ch: ch, v: v })
      .all(rows);
    return e.json(200, { items: rows });
  },
  $apis.requireAuth('users')
);
