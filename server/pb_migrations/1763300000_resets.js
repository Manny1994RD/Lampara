/// <reference path="../pb_data/types.d.ts" />
// Password reset codes. The hub has no email server, so the owner makes a one-time code
// for a member who forgot their password, and the member uses it to choose a new one.

migrate(
  (app) => {
    app
      .db()
      .newQuery(
        `CREATE TABLE IF NOT EXISTS lampara_resets (
          email TEXT PRIMARY KEY NOT NULL,
          code_hash TEXT NOT NULL,
          expires TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        )`
      )
      .execute();
  },
  (app) => {
    app.db().newQuery('DROP TABLE IF EXISTS lampara_resets').execute();
  }
);
