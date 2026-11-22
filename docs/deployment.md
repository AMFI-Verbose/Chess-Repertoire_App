# Deploying Chess Repertoire

Two supported paths: **Vercel + hosted Postgres** (fastest, no server to run) and
**Docker Compose** on any VPS (full control, one command). Both use the same
image of the app and the same PostgreSQL schema.

## What production needs

| Variable | Required | Used for |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL 14+ connection string, e.g. `postgresql://user:pass@host:5432/db?schema=public&sslmode=require` |
| `APP_URL` | yes | Absolute origin used in confirmation emails, e.g. `https://chess.example.com` |
| `RESEND_API_KEY` + `MAIL_FROM` | one mail path | Email delivery through Resend |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` + `MAIL_FROM` | or the other | Email delivery through any SMTP server |
| `POSTGRES_PASSWORD` | compose only | Password for the bundled database |

If no mail path is configured the app does not silently pretend to send: the
sign-up response and the "resend" button print the confirmation link itself.
That is deliberate for local testing and must not be relied on in public.

### Limits that are already built in

- sign-up: 5 per IP per hour
- sign-in: 12 per IP / 10 min, and 6 per identity / 10 min
- comments: 6 per account per minute
- publishing a study: 4 per account per hour
- confirmation emails: 3 per account per hour
- unconfirmed accounts can read everything but cannot publish or comment

Counters live in the `RateLimit` table, so they survive restarts and work across
multiple app instances. Behind Vercel or nginx the client IP is read from
`x-forwarded-for` / `x-real-ip`.

---

## Path A — Vercel + hosted Postgres (Neon, Supabase, RDS)

1. Create the database and copy its connection string. On Neon use the **pooled**
   string for the app and add `?sslmode=require`.
2. Push the repository to GitHub and import it in Vercel.
3. In **Project → Settings → Environment Variables** add `DATABASE_URL`,
   `APP_URL` (your `*.vercel.app` domain first, custom domain later), and either
   `RESEND_API_KEY` + `MAIL_FROM` or the `SMTP_*` set. Add them to Production,
   Preview and Development as needed.
4. Deploy. `vercel.json` runs `prisma migrate deploy` before `next build`, so the
   schema is created on the first deploy and updated on every later one.
5. Seed the first deploy once, from your machine against the hosted database:

   ```bash
   DATABASE_URL="postgresql://…" npm run db:setup
   ```

   `db:setup` is additive (`createMany … skipDuplicates`); it is safe to run
   again. Puzzles are separate and big: `npm run db:puzzles` after downloading
   `lichess_db_puzzle.csv.zst` into `.cache/`.
6. Point `APP_URL` at the final domain after attaching it, otherwise confirmation
   emails will link to the old host.

Stockfish is a WASM build copied into `public/engine` at build time, so no
server-side engine and no long-running function is needed. The heaviest route is
the community index; it is dynamic and reads a handful of rows.

### Daily Lichess import on Vercel

There is no server to host a cron job, so run the importer from GitHub Actions
(or any scheduler) with the production `DATABASE_URL`:

```yaml
on:
  schedule: [{ cron: "20 23 * * *" }]   # 07:20 Asia/Shanghai
jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run lichess:import
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## Path B — Docker Compose on your own server

```bash
git clone https://github.com/<you>/Chess-Repertoire_App.git
cd Chess-Repertoire_App
cp .env.example .env          # optional; compose reads the shell environment
POSTGRES_PASSWORD='something-long' APP_URL='https://chess.example.com' \
  docker compose up -d --build
```

What happens: Postgres 16 starts with a named volume, the web image waits for the
health check, `docker/entrypoint.sh` runs `prisma migrate deploy`, seeds the
sample content **only if the database is empty**, then `next start` on port 3000.

Put nginx or Caddy in front for TLS:

```nginx
server {
  listen 443 ssl;
  server_name chess.example.com;
  ssl_certificate     /etc/letsencrypt/live/chess.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/chess.example.com/privkey.pem;
  client_max_body_size 10m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`X-Forwarded-For` matters: without it every request looks like one IP and the
sign-up limit becomes a global limit.

### Operations

```bash
docker compose logs -f web                 # app logs
docker compose exec web npx prisma migrate deploy   # after pulling a new version
docker compose exec web npm run lichess:import     # manual import (see package.json)
docker compose exec db pg_dump -U chess chess_repertoire > backup.sql
```

Daily import: a host crontab entry running the importer inside the container.

```cron
20 7 * * * cd /srv/Chess-Repertoire_App && docker compose exec -T web npm run lichess:import >> /var/log/chess-import.log 2>&1
```

---

## Moving existing data (the SQLite era → Postgres)

`scripts/migrate-sqlite-to-postgres.mjs` copies the old `prisma/dev.db` into the
configured Postgres database table by table, in foreign-key order, with
`skipDuplicates`. It was used for the switch on this machine and can be run once
against a hosted database:

```bash
DATABASE_URL="postgresql://…" node scripts/migrate-sqlite-to-postgres.mjs
```

Existing accounts arrive verified only if they were verified before; new
accounts go through the email flow.

## Health checklist after a deploy

- `/community` lists the seeded studies and imported Lichess games.
- Sign up with a real address → mail arrives → the link opens `/verify` and the
  account can then comment.
- Six rapid comments from one account stop with a rate-limit message instead of
  writing rows.
- `/openings`, `/learn`, `/puzzles`, `/train` load with the engine in the network
  tab (`/engine/stockfish-19-lite-single.wasm`).
