/// <reference path="../pb_data/types.d.ts" />
// Bibles stored on the hub, so phones can read them without keeping a full copy.
// Plain tables (not PocketBase collections): they're only reached through the
// /api/lampara/bibles routes in pb_hooks/bibles.pb.js, which check who you are.

migrate(
  (app) => {
    app
      .db()
      .newQuery(
        `CREATE TABLE IF NOT EXISTS lampara_bibles (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          abbr TEXT NOT NULL,
          lang TEXT NOT NULL,
          comments TEXT NOT NULL DEFAULT '',
          verse_count INTEGER NOT NULL DEFAULT 0,
          has_ot INTEGER NOT NULL DEFAULT 0,
          has_nt INTEGER NOT NULL DEFAULT 0,
          complete INTEGER NOT NULL DEFAULT 0,
          uploaded_by TEXT NOT NULL DEFAULT '',
          created TEXT NOT NULL DEFAULT ''
        )`
      )
      .execute();
    app
      .db()
      .newQuery(
        `CREATE TABLE IF NOT EXISTS lampara_verses (
          bible TEXT NOT NULL,
          book INTEGER NOT NULL,
          ch INTEGER NOT NULL,
          v INTEGER NOT NULL,
          text TEXT NOT NULL,
          norm TEXT NOT NULL,
          marks TEXT NOT NULL DEFAULT '',
          para INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (bible, book, ch, v)
        ) WITHOUT ROWID`
      )
      .execute();
  },
  (app) => {
    app.db().newQuery('DROP TABLE IF EXISTS lampara_verses').execute();
    app.db().newQuery('DROP TABLE IF EXISTS lampara_bibles').execute();
  }
);
