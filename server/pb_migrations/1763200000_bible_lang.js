/// <reference path="../pb_data/types.d.ts" />
// Bibles named "... Version" (e.g. King James Version) were taken for Spanish when imported.
// Check every Bible's language again from the words in John 1.

migrate(
  (app) => {
    const bibles = arrayOf(new DynamicModel({ id: '', name: '', lang: '' }));
    app.db().newQuery('SELECT id, name, lang FROM lampara_bibles').all(bibles);
    for (const b of bibles) {
      const rows = arrayOf(new DynamicModel({ norm: '' }));
      app
        .db()
        .newQuery('SELECT norm FROM lampara_verses WHERE bible = {:id} AND book = 43 AND ch = 1 ORDER BY v LIMIT 6')
        .bind({ id: b.id })
        .all(rows);
      if (!rows.length) continue;
      const text = ' ' + rows.map((r) => r.norm).join(' ').toLowerCase() + ' ';
      if (/[가-힣]/.test(text) || b.lang === 'ko') continue;
      const count = (words) => words.reduce((n, w) => n + (text.split(' ' + w + ' ').length - 1), 0);
      const es = count(['el', 'los', 'las', 'del', 'que', 'y', 'en', 'por', 'para', 'dios']);
      const en = count(['the', 'and', 'of', 'that', 'lord', 'god', 'unto', 'shall', 'which', 'was']);
      const lang = es > en ? 'es' : 'en';
      if (lang !== b.lang) {
        app.db().newQuery('UPDATE lampara_bibles SET lang = {:lang} WHERE id = {:id}').bind({ lang: lang, id: b.id }).execute();
      }
    }
  },
  () => {}
);
