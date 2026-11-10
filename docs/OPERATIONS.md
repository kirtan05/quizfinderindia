# Operations

How the live site is kept running. This is the maintainer's runbook; setup from scratch is in the [README](../README.md#self-hosting--setup).

## What runs where

| Piece | Where | Notes |
|-------|-------|-------|
| Site | Cloudflare Pages project `quizfinder`, <https://quizfinder.pages.dev> | Direct upload, production branch `master`. Cloudflare does not build anything. |
| Push API | Pages Functions in `client/functions/api/` | `subscribe.js` stores subscriptions in KV (`PUSH_SUBS`), `notify.js` sends pushes. |
| Watcher | systemd user timer on the maintainer's machine | `quizfinder-watch.timer`, at :07 and :37 every hour. |
| WhatsApp messages | The `wa` daemon's SQLite store, `~/.local/share/wa/store/wa.db` | The watcher only reads it. It opens its own connection only to download posters and to send failure alerts. |
| Extraction | `claude -p` (Claude Code login, no API key) | Runs with no tools; the poster is passed inline. |
| Old Vercel site | `vercel.json` | Redirects every path (307) to the same path on `quizfinder.pages.dev`. |

## One watcher run

`node server/sync/watch.js` does this, in order:

1. Takes the lock `data/.watch.lock`; a second run exits straight away.
2. Reads messages newer than `watch.lastTs` from the groups in `data/city-groups.json`. A poster and a text sent within 120 seconds by the same person are treated as one announcement.
3. Drops chatter. In groups marked `"discussion": true` a message needs 150+ characters and a quiz-like word; elsewhere an image or 80+ characters.
4. Sends each candidate to Claude. Non-quizzes, past dates and duplicates are skipped. Output is type-checked (`sanitize()` in `extractor.js`) before it is stored.
5. Every `IG_EVERY_HOURS` (default 6) also scrapes the Instagram pages in `server/sync/instagram/pages.json`, resuming from where it stopped if Instagram blocked the previous pass.
6. Quizzes below `CONFIDENCE_THRESHOLD` are stored as `flagged` and stay off the site until reviewed in the admin panel (`npm run dev`, then `/admin`).
7. If anything was added: commits `data/quizzes.json` on `master` and pushes.
8. Builds `client/` and uploads `client/dist` with Wrangler. Skipped, and retried on the next run, if `client/` has uncommitted changes, so half-finished frontend work never goes live.
9. After a successful deploy, POSTs the new quizzes to `/api/notify`, which pushes to matching subscribers in batches of 8.
10. On failure, WhatsApps the maintainer's own number, at most once every 6 hours.

Flags: `--dry-run`, `--no-push`, `--days N` (look back N days instead of from `lastTs`), `--ig` / `--no-ig` (force or skip Instagram), `--deploy` (build and deploy even with nothing new).

State is in `data/sync-state.json` (git-ignored) under `watch`: `lastTs`, `lastIgAt`, `igOffset`, `lastAlertAt`, `deployPending`.

## Everyday commands

```bash
systemctl --user list-timers quizfinder-watch.timer    # next and last run
journalctl --user -u quizfinder-watch -n 100           # logs
systemctl --user stop quizfinder-watch.timer           # pause (do this before frontend work)
systemctl --user start quizfinder-watch.timer          # resume
systemctl --user start quizfinder-watch.service        # run once now

npm run watch -- --dry-run     # show what would be added, change nothing
npm run deploy                 # rebuild and redeploy the site now
npm run deploy -- --no-ig      # same, without an Instagram pass
```

After editing `deploy/quizfinder-watch.{service,timer}`:

```bash
cp deploy/quizfinder-watch.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
```

## Changing the frontend

1. Stop the timer.
2. Work in `client/` (`npm run dev:client`). `npm install` works inside `client/`; at the repo root it fails on this machine because npm refuses Baileys' git dependency. The watcher itself needs no `node_modules`: it borrows Baileys from the `wa` CLI checkout (`WA_CLI_DIR`, default `~/Desktop/projects/wa-cli`).
3. Commit, then `npm run deploy -- --no-ig`.
4. Start the timer.

## Secrets and keys

| What | Where | If lost |
|------|-------|---------|
| `NOTIFY_SECRET` | Pages secret, and root `.env` (git-ignored) | Generate a new one, set both. |
| `VAPID_PRIVATE_KEY` | Pages secret; backup copy in root `.env` | Every subscriber has to subscribe again. Keep a copy somewhere else too. |
| VAPID public key | `client/wrangler.toml` and `client/.env.production` (public, committed) | Must change together with the private key. |
| Wrangler login | `~/.config/.wrangler` | `npx wrangler login` in `client/`. |
| WhatsApp session | `~/.local/share/wa/auth/` | `wa login`. Never copy or commit this folder. |

Set a Pages secret with `npx wrangler pages secret put NAME --project-name quizfinder` from `client/`.

Posters are not in git. They exist only in `data/posters/` on this machine and in the deployed site; a fresh clone builds with the placeholder image for any poster it does not have.

## Adding a source

- WhatsApp group: join it from the linked account, find its id with `wa groups <name> --json`, add `{ "name", "id" }` under the city in `data/city-groups.json`. Add `"discussion": true` if it is a chat group rather than an announcements group.
- Instagram page: add it to `server/sync/instagram/pages.json`.

## When something breaks

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Log says `Deploy pending` | Uncommitted changes in `client/` | Commit or stash them; the next run deploys. |
| Nothing new for days | `wa` daemon down or logged out | `systemctl --user status wa`, `wa check`. |
| Extraction errors | Claude Code logged out, or `claude` not on the service's `PATH` | Run `claude` once interactively; check `PATH` in the service file. |
| Instagram pass stops early | Anonymous scraping rate-limited | Nothing to do; it resumes from `igOffset` next time. |
| Run exits at once with a lock message | Earlier run still going | Wait for it. A lock left by a crashed run is ignored automatically. |
| Deploy fails on auth | Wrangler login expired | `npx wrangler login` in `client/`. |

## Not yet verified

- A push notification reaching a real device.
- The calendar feeds inside Google Calendar or Apple Calendar (they pass a structural check).
- The site on an actual iPhone.
- The failure alert and the Instagram blocked-then-resume path.
- Push at scale: batches of 8 are sized for Cloudflare's free plan by estimate, not by test.
