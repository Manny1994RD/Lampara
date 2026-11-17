/// <reference path="../pb_data/types.d.ts" />
// Commentaries, study notes and cross-references (e-Sword .cmtx) stored in the church library.
// Plain tables reached only through /api/lampara/commentaries and /api/lampara/notes (commentaries.pb.js).

migrate(
  (app) => {
    app
      .db()
      .newQuery(
        `CREATE TABLE IF NOT EXISTS lampara_commentaries (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          abbr TEXT NOT NULL,
          lang TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'commentary',
          comments TEXT NOT NULL DEFAULT '',
          entries INTEGER NOT NULL DEFAULT 0,
          complete INTEGER NOT NULL DEFAULT 0,
          uploaded_by TEXT NOT NULL DEFAULT '',
          created TEXT NOT NULL DEFAULT ''
        )`
      )
      .execute();
    // One note covers a verse or a passage: book ch1:v1 – ch2:v2.
    app
      .db()
      .newQuery(
        `CREATE TABLE IF NOT EXISTS lampara_comments (
          cm TEXT NOT NULL,
          book INTEGER NOT NULL,
          ch1 INTEGER NOT NULL,
          v1 INTEGER NOT NULL,
          ch2 INTEGER NOT NULL,
          v2 INTEGER NOT NULL,
          text TEXT NOT NULL,
          marks TEXT NOT NULL DEFAULT ''
        )`
      )
      .execute();
    app.db().newQuery('CREATE INDEX IF NOT EXISTS idx_comments_place ON lampara_comments (book, ch1, cm)').execute();
  },
  (app) => {
    app.db().newQuery('DROP TABLE IF EXISTS lampara_comments').execute();
    app.db().newQuery('DROP TABLE IF EXISTS lampara_commentaries').execute();
  }
);
