/// <reference path="../pb_data/types.d.ts" />
// Lámpara hub schema. Runs automatically the first time the server starts.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // Members can look each other up (names / friend codes). Emails stay hidden.
    users.listRule = "@request.auth.id != ''";
    users.viewRule = "@request.auth.id != ''";
    users.fields.add(new TextField({ name: 'friend_code', max: 12 }));
    users.fields.add(new TextField({ name: 'invite', max: 64, hidden: true }));
    users.addIndex('idx_users_friend_code', true, 'friend_code', "friend_code != ''");
    app.save(users);

    const authed = "@request.auth.id != ''";

    // ---- invites: one code = one new member ----
    const invites = new Collection({
      type: 'base',
      name: 'invites',
      listRule: 'created_by = @request.auth.id',
      viewRule: 'created_by = @request.auth.id',
      createRule: authed + ' && created_by = @request.auth.id',
      updateRule: null,
      deleteRule: 'created_by = @request.auth.id && used_by = ""',
      fields: [
        { name: 'code', type: 'text', required: true, min: 6, max: 32 },
        { name: 'note', type: 'text', max: 100 },
        { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: 'used_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_invites_code ON invites (code)'],
    });
    app.save(invites);

    // ---- personal data synced between your devices (only you can read it) ----
    const sync = new Collection({
      type: 'base',
      name: 'sync_items',
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      // Writes go through the /api/lampara/sync route.
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'kind', type: 'text', required: true, max: 40 },
        { name: 'item_id', type: 'text', required: true, max: 80 },
        { name: 'data', type: 'json', maxSize: 200000 },
        { name: 'deleted', type: 'bool' },
        // Increasing change counter (the sync cursor). Set by the sync route.
        { name: 'seq', type: 'number', onlyInt: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_sync_unique ON sync_items (user, kind, item_id)',
        'CREATE INDEX idx_sync_seq ON sync_items (seq)',
        'CREATE INDEX idx_sync_user_seq ON sync_items (user, seq)',
      ],
    });
    app.save(sync);

    // ---- friends ----
    const friendships = new Collection({
      type: 'base',
      name: 'friendships',
      listRule: 'from = @request.auth.id || to = @request.auth.id',
      viewRule: 'from = @request.auth.id || to = @request.auth.id',
      createRule: authed + " && from = @request.auth.id && to != @request.auth.id && status = 'pending'",
      updateRule: "to = @request.auth.id && @request.body.status = 'accepted'",
      deleteRule: 'from = @request.auth.id || to = @request.auth.id',
      fields: [
        { name: 'from', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'to', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'status', type: 'select', values: ['pending', 'accepted'], maxSelect: 1, required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_friend_pair ON friendships ("from", "to")'],
    });
    app.save(friendships);

    // ---- challenges ----
    const challenges = new Collection({
      type: 'base',
      name: 'challenges',
      fields: [
        { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'title', type: 'text', required: true, max: 80 },
        { name: 'message', type: 'text', max: 300 },
        // chapters: read N chapters · days: read on N different days · books: finish these books
        { name: 'goal', type: 'select', values: ['chapters', 'days', 'books'], maxSelect: 1, required: true },
        { name: 'target', type: 'number', min: 1, onlyInt: true },
        { name: 'books', type: 'json', maxSize: 2000 },
        { name: 'start_day', type: 'text', required: true, max: 10 },
        { name: 'end_day', type: 'text', required: true, max: 10 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
    });
    app.save(challenges);

    const members = new Collection({
      type: 'base',
      name: 'challenge_members',
      fields: [
        { name: 'challenge', type: 'relation', collectionId: challenges.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'progress', type: 'number', min: 0 },
        { name: 'done', type: 'bool' },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_member_pair ON challenge_members (challenge, user)'],
    });
    const isMember = 'challenge.challenge_members_via_challenge.user ?= @request.auth.id';
    members.listRule = 'user = @request.auth.id || ' + isMember;
    members.viewRule = members.listRule;
    // The challenge owner adds friends; anyone can add themselves.
    members.createRule = authed + ' && (user = @request.auth.id || challenge.owner = @request.auth.id)';
    members.updateRule = 'user = @request.auth.id && @request.body.user:isset = false && @request.body.challenge:isset = false';
    members.deleteRule = 'user = @request.auth.id || challenge.owner = @request.auth.id';
    app.save(members);

    challenges.listRule = 'owner = @request.auth.id || challenge_members_via_challenge.user ?= @request.auth.id';
    challenges.viewRule = challenges.listRule;
    challenges.createRule = authed + ' && owner = @request.auth.id';
    challenges.updateRule = 'owner = @request.auth.id && @request.body.owner:isset = false';
    challenges.deleteRule = 'owner = @request.auth.id';
    app.save(challenges);

    // ---- activity: progress updates, cheers and nudges inside a challenge ----
    const activity = new Collection({
      type: 'base',
      name: 'activity',
      listRule: 'challenge.challenge_members_via_challenge.user ?= @request.auth.id',
      viewRule: 'challenge.challenge_members_via_challenge.user ?= @request.auth.id',
      createRule: authed + ' && user = @request.auth.id && challenge.challenge_members_via_challenge.user ?= @request.auth.id',
      updateRule: null,
      deleteRule: 'user = @request.auth.id',
      fields: [
        { name: 'challenge', type: 'relation', collectionId: challenges.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'target', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'kind', type: 'select', values: ['joined', 'progress', 'completed', 'cheer', 'nudge'], maxSelect: 1, required: true },
        { name: 'text', type: 'text', max: 200 },
        { name: 'emoji', type: 'text', max: 8 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX idx_activity_challenge ON activity (challenge, created)'],
    });
    app.save(activity);
  },
  (app) => {
    for (const name of ['activity', 'challenge_members', 'challenges', 'friendships', 'sync_items', 'invites']) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // already gone
      }
    }
  }
);
