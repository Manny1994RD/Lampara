# Lámpara hub (for ZimaOS)

The hub is a small server that runs on your ZimaOS. It:

- keeps your **phone, tablet and the website in sync** (reading progress, highlights, notes, topics, bookmarks, plans),
- holds **accounts** for you and the friends you invite (invite-only — nobody else can sign up),
- powers **friend challenges**: leaderboards, progress, cheers and nudges,
- stores **your Bibles** (optional) so your devices don't need their own copies.

Bibles are stored only on this server (in its `pb_data` folder), never in GitHub. Only signed-in members of your hub
can read them, and only you (the owner) can add or delete them.

It's built on [PocketBase](https://pocketbase.io) (one small program + a SQLite database), packaged with Docker.

---

## 1. Install on ZimaOS

You need the repository on the ZimaOS machine. In the ZimaOS terminal (or over SSH):

```bash
cd /DATA/AppData
git clone https://github.com/Manny1994RD/Lampara.git lampara
cd lampara/server
docker compose up -d --build
```

> The repo is private, so `git clone` will ask you to sign in to GitHub (use a personal access token as the password),
> or download the repo as a ZIP from GitHub and copy the `server` folder to ZimaOS.

Check it's running: open `http://<zimaos-ip>:8090/api/health` in a browser — you should see `"API is healthy."`

Your data lives in `/DATA/AppData/lampara/server/pb_data`. **Back up that folder** (ZimaOS backup, or copy it now and then).

### Admin dashboard (optional)

PocketBase has an admin dashboard at `http://<zimaos-ip>:8090/_/`. Create the admin login once:

```bash
docker exec -it lampara-hub /pb/pocketbase superuser upsert you@example.com 'a-long-password' --dir=/pb/pb_data
```

You don't need the dashboard for normal use — everything is done from the app.

---

## 2. Create your account (the owner)

1. In Lámpara: **Friends → Connect to your hub** (or Settings → Hub).
2. Hub address: `http://<zimaos-ip>:8090` (e.g. `http://192.168.1.50:8090`).
3. Choose **Join with an invite**, enter your name, email and a password. Leave the invite code empty —
   **the very first account doesn't need one**. Every account after that does.

Everything already on that device (reading history, highlights, notes, plans…) is uploaded, and your other devices
pull it when you sign in on them with the same email and password (use **Sign in** there).

## 3. Invite friends

Friends tab → **Invite someone new → New invite**. Share the message (hub address + code). Each code works once.
After they join, add each other with your **friend codes** (shown at the top of the Friends tab).

## 4. Challenges

Friends tab → **New challenge**: read N chapters, read on N days, or finish specific books, over 7–40 days.
Progress is calculated on each person's device from the chapters they mark as read, and shared when it syncs.
Tap **Cheer** to send 🔥👏🙏💪❤️, or **Nudge** someone who's behind.

---

## Reaching the hub away from home

At home, `http://<zimaos-ip>:8090` works on your Wi-Fi. To use it anywhere (and to share it with friends outside your
home), pick one:

- **Tailscale** (recommended for you + a few friends): install Tailscale from the ZimaOS app store and on each phone.
  Use the ZimaOS Tailscale address, e.g. `http://zimaos.your-tailnet.ts.net:8090`.
  `tailscale serve` can also give it an `https://` address.
- **Cloudflare Tunnel**: gives the hub a public `https://` address on your own domain without opening router ports.

> **Note for Android:** release APKs only allow plain `http://` addresses if the app is built to allow it. The APK build
> step (next phase) will either enable that for your home network or use your `https://` (Tailscale/Cloudflare) address.

---

## Updating

```bash
cd /DATA/AppData/lampara
git pull
cd server
docker compose up -d --build
```

Database changes (new tables/fields) are applied automatically on start-up from `pb_migrations/`.

## 5. Your Bibles on the hub

1. On the PC, open the Lámpara website (or the app), go to **Settings → Bibles → Import Bible (.bblx)** and pick
   your files from `DocumentsBiblias`.
2. Tap **Upload to hub** under each Bible (only the owner account sees this button).
3. Every device signed in to the hub now lists those Bibles automatically. Phones keep only the ~150 chapters you
   read most recently; tap **Save offline** to keep a whole Bible on a device (for reading without internet), or
   **Remove from device** to free the space again.

To delete a Bible from the hub (and every device), tap the trash icon next to it while signed in as the owner.

## Testing the server

`server/test/api-test.mjs` checks invite-only sign-up, private sync, friends, challenge privacy and cheers against a
**fresh test server** (it creates throwaway accounts — never run it against your real hub):

```bash
node server/test/api-test.mjs http://127.0.0.1:8090
```

`server/test/bible-test.mjs` checks the Bible routes (owner-only upload/delete, members can read, chapter/book/search):

```bash
node server/test/bible-test.mjs http://127.0.0.1:8090 owner@test.local member@test.local test-password-123
```

## What's inside

| File | What it does |
|---|---|
| `Dockerfile` | Downloads PocketBase (v0.40.6) and adds the Lámpara files |
| `docker-compose.yml` | Runs it on port 8090, data in `./pb_data` |
| `pb_migrations/1763000000_lampara.js` | Tables and permission rules |
| `pb_hooks/lampara.pb.js` | Invite-only sign-up and the `/api/lampara/sync` endpoint |
| `pb_migrations/1763100000_bibles.js` | Tables for Bibles stored on the hub |
| `pb_hooks/bibles.pb.js` | `/api/lampara/bibles` routes: list, upload, read chapters, search |

### Privacy rules (enforced by the server)

- `sync_items` (your synced data): only you can read it; writes only through the sync endpoint.
- `users`: members can see each other's **name and friend code**; emails stay hidden.
- `friendships`: only the two people involved; only the receiver can accept.
- `challenges`, `challenge_members`, `activity`: only people in that challenge. Only you can change your own progress.
- `invites`: only the person who created them; each code is used once.
- Bibles: any signed-in member can read; only the owner (first account) can upload or delete.
