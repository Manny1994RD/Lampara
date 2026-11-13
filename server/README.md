# Lámpara hub (for ZimaOS)

The hub is a small server that runs on your ZimaOS. It:

- serves the **Lámpara website** at the hub's address (open it on iPhone, a PC, anywhere — "Add to Home Screen" on iPhone),

- keeps your **phone, tablet and the website in sync** (reading progress, highlights, notes, topics, bookmarks, plans),
- holds **accounts** for you and the friends you invite (invite-only — nobody else can sign up),
- powers **friend challenges**: leaderboards, progress, cheers and nudges,
- stores **your Bibles** (optional) so your devices don't need their own copies.

Bibles are stored only on this server (in its `pb_data` folder), never in GitHub. Only signed-in members of your hub
can read them, and only you (the owner) can add or delete them.

It's built on [PocketBase](https://pocketbase.io) (one small program + a SQLite database), packaged with Docker.

---

## 1. Install on ZimaOS

One container runs everything: the hub **and** the website, on port 8090.

Open a terminal on ZimaOS (Settings → enable SSH, then `ssh` from your PC, or the ZimaOS web terminal) and run:

```bash
cd /DATA/AppData
git clone https://github.com/Manny1994RD/Lampara.git lampara
cd lampara/server
docker compose up -d --build
```

- The repo is private: when `git clone` asks for a password, use a GitHub **personal access token**
  (GitHub → Settings → Developer settings → Fine-grained tokens → read-only access to the *Lampara* repo).
- The first build downloads the app's packages and builds the website, so it takes a few minutes
  (it needs ~2 GB of free memory while building).

Check it's running:

- `http://<zimaos-ip>:8090/api/health` → `"API is healthy."`
- `http://<zimaos-ip>:8090/` → the Lámpara website. (On plain `http://` the website only works from `localhost`;
  use the `https://` Tailscale address below to open it from other devices.)

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

## Open it anywhere with Tailscale (https)

The website needs an `https://` address (browsers only allow its offline database on secure pages), and `https`
is nicer for the phone app too. Tailscale gives you one with a real certificate, without opening router ports.

1. **Tailscale on ZimaOS** — install it from the ZimaOS App Store (if you haven't) and sign in.
2. **Turn on HTTPS once** — in the Tailscale admin console → **DNS**: make sure **MagicDNS** is on, then
   **Enable HTTPS** (Certificates).
3. **Share port 8090 over https** — in the ZimaOS terminal:

   ```bash
   # If Tailscale runs as a ZimaOS app (a container), find its name first:
   docker ps --format '{{.Names}}' | grep -i tailscale
   docker exec <that-name> tailscale serve --bg 8090

   # If the tailscale command works directly on ZimaOS instead:
   tailscale serve --bg 8090
   ```

   It prints your address, like `https://zimaos.tail1234.ts.net`. That's your Lámpara address:
   - **Website:** open `https://zimaos.tail1234.ts.net` on any device that has Tailscale on.
     On iPhone: Safari → Share → **Add to Home Screen**.
   - **Phone app:** Settings → Hub → use the same address.
   - Check it anytime with `tailscale serve status` (same `docker exec …` prefix if needed).

**Friends:** with `tailscale serve`, only devices in your tailnet can open it — share your ZimaOS machine with a
friend from the Tailscale admin console (Machines → … → Share), and they install Tailscale too. If you'd rather
friends open it without Tailscale, `tailscale funnel --bg 8090` (instead of `serve`) puts the same address on the
public internet. The hub is invite-only either way, but with Funnel anyone can reach the sign-in page.

At home on Wi-Fi the app also works with `http://<zimaos-ip>:8090` (the Android app is built to allow it).

---

## Updating

```bash
cd /DATA/AppData/lampara
git pull
cd server
docker compose up -d --build
```

This rebuilds the website too. Database changes (new tables/fields) are applied automatically on start-up from
`pb_migrations/`. Your data in `pb_data` is kept.

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
| `Dockerfile` | Builds the website, downloads PocketBase (v0.40.6) and adds the Lámpara files |
| `docker-compose.yml` | Runs it on port 8090, data in `./pb_data` |
| `pb_migrations/1763000000_lampara.js` | Tables and permission rules |
| `pb_hooks/lampara.pb.js` | Invite-only sign-up and the `/api/lampara/sync` endpoint |
| `pb_migrations/1763100000_bibles.js` | Tables for Bibles stored on the hub |
| `pb_hooks/web.pb.js` | Headers the website needs (its offline database) |
| `pb_hooks/bibles.pb.js` | `/api/lampara/bibles` routes: list, upload, read chapters, search |

### Privacy rules (enforced by the server)

- `sync_items` (your synced data): only you can read it; writes only through the sync endpoint.
- `users`: members can see each other's **name and friend code**; emails stay hidden.
- `friendships`: only the two people involved; only the receiver can accept.
- `challenges`, `challenge_members`, `activity`: only people in that challenge. Only you can change your own progress.
- `invites`: only the person who created them; each code is used once.
- Bibles: any signed-in member can read; only the owner (first account) can upload or delete.
