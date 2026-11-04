# Satsang Portal

Weekly satsang availability and slokam allocation for the A2322 batch.
What it does: [Satsang-Portal-Spec.md](Satsang-Portal-Spec.md). How it is built: [design.md](design.md).

## Run it on this computer

```bash
npm install
npx prisma dev start satsang      # local database (first time: npx prisma dev --name satsang --detach)
npx prisma migrate dev             # create / update tables
SEED_DEMO=1 npx prisma db seed     # admin account, batch, schedule + demo names and both templates
npm run dev                        # http://localhost:3000
```

- Bhakta pages: `/` (vote) and `/allocation` (view, XLSX, PDF).
- Admin: `/admin`. First sign-in uses `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD` from `.env` and must change the password.
- Leave out `SEED_DEMO=1` for a clean start; then import the master list and templates from the admin pages.
- `npx tsx scripts/demo-votes.ts` adds demo votes to the current satsang (local testing only).

## Tests

```bash
npm test
```

Covers the allocation rules (including the spec's worked example), name matching, IST schedule times, master-list import,
both sample templates in `tests/fixtures/`, and an export round trip (allocation → XLSX → read back).

## Where things live

| Path | What |
| --- | --- |
| `lib/allocation.ts` | Allocation engine (pure, deterministic) |
| `lib/templates.ts` | Reads allocation-sheet templates (columns A–E, merged cells → fill units) |
| `lib/masterList.ts` | Master-list import (column A only) |
| `lib/satsangs.ts` | Weekly lifecycle, auto mode, generate |
| `lib/export.ts` | XLSX download in the sheet layout |
| `lib/auth.ts` | Admin login, sessions, lockout, first-login password change |
| `app/` | Pages: bhakta (`/`, `/allocation`) and admin (`/admin/...`) |
| `app/api/cron/daily` | Daily backstop job (Vercel Cron, see `vercel.json`) |
| `prisma/` | Database schema, migrations, seed |

## Deploying (not done yet)

1. Create a free Neon Postgres database and a Vercel project linked to the GitHub repo.
2. In Vercel set `DATABASE_URL` (Neon pooled URL), `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `CRON_SECRET`.
3. Run `npx prisma migrate deploy` and `npx prisma db seed` against Neon once.
