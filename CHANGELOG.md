# Change log

Every change requested for the Satsang Portal, newest first. Each entry says what was asked, what changed, and where.

---

## 2026-11-07

### Supabase settings file prepared
- **Requested:** create `.env.supabase` with the variables to fill in for Supabase.
- **Changed:** new local file `.env.supabase` with blanks for `DATABASE_URL`, `DIRECT_URL` and `ADMIN_INITIAL_PASSWORD`, `ADMIN_USERNAME` set to `admin`, and a random `CRON_SECRET` already filled in. Git ignores it, so it never leaves this computer.
- **Files:** `.env.supabase` (not in git).

### Tables created in Supabase
- **Requested:** set up the Supabase database.
- **Changed:** all 3 migrations applied to the Supabase project (Mumbai region). Checked: the app's connection (transaction pooler) works, and all 14 tables have row-level security on. Local `.env` untouched.
- **Then:** starting data added to Supabase (no demo data): admin account `admin` (must change password at first sign-in), the A2322 batch, and the weekly schedule (Sat 7 pm; voting Mon 6 am – Tue 11:59 pm; publish Wed 6 am IST). Master list and templates are still empty and are imported from the admin pages.

---

## 2026-11-05

### Database on Supabase instead of Neon
- **Requested:** use the existing Supabase account.
- **Changed:** the app uses Supabase's transaction pooler; migrations use the session pooler (`DIRECT_URL`). New migration turns on row-level security on every table so Supabase's automatic Data API can't read or change anything; the app is unaffected.
- **Files:** `prisma.config.ts`, `.env.example`, `prisma/migrations/…_enable_row_level_security`, `README.md` (deploy steps), `design.md` §1, §2, §10a, §11, §13; `Satsang-Portal-Spec.md` (stack, decisions log).

---

## 2026-11-04

### Opening Prayer and Pledge share a backup
- **Requested:** Opening Prayer and Pledge don't need their own backups. If there are enough backup volunteers they can have separate ones; if not, the same person covers both and continues into the first Poorvangam sections.
- **Changed:** Backups are now matched to groups so that, where possible, nobody's group contains their own slokam. Each group then keeps one backup from start to end (e.g. Opening Prayer + Pledge + early Poorvangam) instead of handing a single prayer to someone else. A hand-over only happens when no arrangement avoids it.
- **Effect on the spec's worked example:** Meena now backs up rows 1–5 and Ravi rows 6–10 (previously each skipped their own row and swapped it).
- **Files:** `lib/allocation.ts`, `tests/allocation.test.ts`, `Satsang-Portal-Spec.md` (rule 8, worked example, decisions log), `design.md` §5.2.

### Saved in git
- **Requested:** publish in git and online.
- **Changed:** git repository created on this computer; first version saved (commit `b6c4973`). `.env` (passwords) and AI-tool reference folders are excluded.

### Test week reopened for voting (local demo only)
- **Requested:** show the page where bhaktas vote.
- **Changed:** the local test week (Sat 7 Nov) was put back to "voting open" so the form shows; its test allocation was cleared, votes kept. Added `scripts/reopen-voting.ts` (dev helper). No app code changed.

### Change log started
- **Requested:** keep a change log for each change requested and made.
- **Changed:** this file. Earlier changes below were written up from the conversation history.

---

## 2026-11-03

### First working app built
- **Requested:** start building the app.
- **Changed:** Next.js 16 + Prisma 7 app with all spec screens: voting page, published allocation (search, XLSX, PDF), admin dashboard, master list, templates, schedule, responses, allocation editor, password page, daily backstop job. Local database via `prisma dev`; demo data from the sample files.
- **Fixed during testing:** vote form kept the typed name after an error; first-login password change now goes to the dashboard; admin allocation page made light (name picker opens only for the row being changed); public table width.
- **Files:** `app/`, `lib/`, `prisma/`, `tests/`, `README.md`.

---

## 2026-11-02

### Second template (long blocks)
- **Requested:** `satsang 12 allocation list.xlsx` is another template; columns A–E are what participants see and download.
- **Changed:** two A2322 templates (short blocks: 53 to fill; long blocks: 28 to fill). One "Allocated to" cell = one fill unit, even when it covers two lines (e.g. Poorvangam 19–22 + Poorvanyasam). Output keeps the sheet's merges. The "Trail Satsang-2" sheet is a different batch, not a template.
- **Files:** `design.md` §3, §6, §15; `Satsang-Portal-Spec.md` (template format).

### Template = columns A–E of the allocation sheet
- **Requested:** columns A–E of `A2322-Allocation.xlsx` are the template.
- **Changed:** a past allocation can be uploaded as is; names are cleared except fixed names (VISVAS); columns beyond E ignored; admin picks the sheet.
- **Files:** `design.md` §6; `Satsang-Portal-Spec.md` (template format).

### Satsang time confirmed
- **Requested:** satsang is Saturday 7 PM.
- **Changed:** nothing needed (already the default). Header lines are rewritten each week from the schedule.

### Master list: column A is the master copy
- **Requested:** column A of the master file is the master copy; copy files if needed.
- **Changed:** import reads column A only; phone and nickname columns never read or stored; blank column A rows listed for the admin. Test copies saved in `tests/fixtures/` (names-only master list, both allocation sheets).
- **Files:** `design.md` §6; `Satsang-Portal-Spec.md` A2.

### Master list and sample allocation reviewed
- **Requested:** use `Master csv copy.xlsx` (master list) and `A2322-Allocation.xlsx` (sample allocation).
- **Changed:** import accepts the contacts export; preview flags emails, digits, all-lower/all-caps names.
- **Decisions:** prayers are filled top to bottom like any row (as in the sample); backups stay as in the spec (bhaktas who vote "Available + backup"), not the sample's separate roster.
- **Files:** `design.md` §5–§6, §14–§15; `Satsang-Portal-Spec.md` rules 2, 4, decisions log.

### VISVAS row gets a backup
- **Requested:** the VISVAS row will also have a backup.
- **Changed:** pre-filled rows are included in backup groups.
- **Files:** `design.md` §5.2, §15; `Satsang-Portal-Spec.md` row kinds, rule 7, decisions log.

### Design decisions confirmed
- **Requested:** yes to the listed design decisions.
- **Changed:** marked confirmed; listed in `design.md` §15 and the spec's decisions log.

### Admin must change password at first login
- **Requested:** admin logs in and changes the password at the first login.
- **Changed:** forced password change before any other admin page.
- **Files:** `design.md` §3, §10; `Satsang-Portal-Spec.md` A1, data model.

### Duplicate names allowed
- **Requested:** allow duplicates in the master list.
- **Changed:** duplicates are merged into one entry; renaming onto an existing name is refused.
- **Files:** `design.md` §6; `Satsang-Portal-Spec.md` A2, edge cases.

### Template always chosen by the admin
- **Requested:** the template will be chosen by the admin.
- **Changed:** no automatic template selection in v2; v2 uses the admin's choice and holds publishing if it has too few blocks.
- **Files:** `design.md` §4, §5.1; `Satsang-Portal-Spec.md` A8, rule 1, decisions log.

### Technical design created
- **Requested:** create the design.md file.
- **Changed:** `design.md` written from the PRD.
