# Satsang Portal — Technical Design (v0.1)

Nov 2, 2026 · Companion to [Satsang-Portal-Spec.md](Satsang-Portal-Spec.md) (PRD v0.3)

This document describes **how** the portal is built. The PRD remains the source of truth for **what** it does; requirement IDs (A1–A12, B1–B9) refer to it. Where the PRD leaves a detail open, the choice made here is marked **Design decision** and listed in §15; all were confirmed on Nov 2, 2026.

---

## 1. Goals and constraints

- One Next.js (TypeScript) app on Vercel Hobby, PostgreSQL on Supabase free tier, Prisma ORM. Zero hosting cost. (Neon was the first choice; switched to Supabase on Nov 5.)
- Solo builder with AI coding help: prefer few moving parts, plain patterns, no extra services (no Redis, no queue, no paid cron).
- All times are IST (Asia/Kolkata) in the UI; stored as UTC `timestamptz`.
- Allocation must be **deterministic**: same inputs → same grid.
- Bhakta data is name + weekly response only. No IPs kept beyond short-lived rate-limit counters.
- Scale: ≤ 500 names per batch, ≤ 200 concurrent viewers; public pages < 2 s on 4G.

## 2. Architecture

```
 Browser (bhakta / admin)
        │  HTTPS
        ▼
 ┌───────────────────────── Vercel ─────────────────────────┐
 │ Next.js App Router                                        │
 │  ├─ Public pages   /  /allocation  /allocation/print      │
 │  ├─ Admin pages    /admin/**   (guarded by middleware)    │
 │  ├─ Server Actions (forms: vote, admin edits)             │
 │  ├─ Route handlers /api/export/*, /api/cron/daily         │
 │  └─ lib/ domain: lifecycle, allocation, templates, auth   │
 │                                                           │
 │  Vercel Cron: 1×/day → /api/cron/daily (backstop)         │
 └──────────────────────────┬────────────────────────────────┘
                            │ Prisma (pooled connection)
                            ▼
                 Supabase PostgreSQL
```

- **Rendering:** public pages are server-rendered on each request (`dynamic = "force-dynamic"`) because their content depends on the clock (see §4). Pages are small, so this stays well under 2 s.
- **Mutations:** Next.js Server Actions for forms; route handlers only for file downloads and the cron endpoint.
- **Domain logic** lives in plain TypeScript modules under `lib/` with no Next.js imports, so it can be unit-tested directly.

### Project layout

```
app/
  page.tsx                         # B1–B6 home + vote form
  allocation/page.tsx              # B7 read-only allocation
  allocation/print/page.tsx        # print layout → "Save as PDF" (B8, A11)
  admin/login/page.tsx
  admin/(protected)/layout.tsx     # session check
  admin/(protected)/page.tsx       # this week's dashboard
  admin/(protected)/bhaktas/…      # A2
  admin/(protected)/templates/…    # A6
  admin/(protected)/schedule/…     # A3
  admin/(protected)/satsangs/[id]/responses/…   # A7
  admin/(protected)/satsangs/[id]/allocation/…  # A8–A12
  admin/(protected)/account/…      # change password
  api/export/[satsangId]/xlsx/route.ts
  api/cron/daily/route.ts
lib/
  time.ts          # IST helpers (date-fns-tz)
  lifecycle.ts     # effective state, lazy transitions
  allocation.ts    # pure allocation algorithm
  templates.ts     # XLSX template parser
  export.ts        # XLSX writer (exceljs)
  names.ts         # name normalisation & matching
  auth.ts          # password, sessions, lockout
  rateLimit.ts
  audit.ts
prisma/schema.prisma
middleware.ts      # /admin/** redirect when no session cookie
tests/
```

## 3. Data model (Prisma)

Matches the PRD data model, plus two support tables (`AdminSession`, `RateLimitHit`) and a sequence number on `Satsang` for rotation.

```prisma
enum SatsangStatus { SCHEDULED OPEN CLOSED ALLOCATED PUBLISHED COMPLETED }
enum Choice        { AVAILABLE NOT_AVAILABLE BACKUP }
enum RowKind       { BLOCK NAMED_PART SINGLE_PRAYER PREFILLED }
enum RowStatus     { ASSIGNED DROPPED COVERED }
enum Actor         { ADMIN SCHEDULER }

model AdminAccount {
  id             Int       @id @default(1)        // exactly one row
  username       String    @unique
  passwordHash   String
  failedAttempts Int       @default(0)
  lockedUntil    DateTime?
  mustChangePassword Boolean @default(true)  // forced change at first login
  updatedAt      DateTime  @updatedAt
}

model AdminSession {
  id         String   @id                 // sha256(token); raw token only in cookie
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
}

model Batch {
  id       Int     @id @default(autoincrement())
  name     String                          // "A2322/2874 Tamil Batch (7:30PM)"
  active   Boolean @default(true)
  bhaktas  Bhakta[]
  satsangs Satsang[]
  schedule WeeklySchedule?
}

model Bhakta {
  id        Int     @id @default(autoincrement())
  batchId   Int
  name      String                         // display spelling
  nameKey   String                         // normaliseName(name)
  listOrder Int
  active    Boolean @default(true)
  batch     Batch   @relation(fields: [batchId], references: [id])
  @@unique([batchId, nameKey])               // duplicates are merged into one entry (§6)
}

model WeeklySchedule {
  id                Int     @id @default(autoincrement())
  batchId           Int     @unique
  timezone          String  @default("Asia/Kolkata")
  satsangDay        Int     @default(6)      // 0=Sun … 6=Sat
  satsangTime       String  @default("19:00")
  openDay           Int     @default(1)
  openTime          String  @default("06:00")
  closeDay          Int     @default(2)
  closeTime         String  @default("23:59")
  publishDay        Int     @default(3)
  publishTime       String  @default("06:00")
  defaultTemplateId Int?
  autoMode          Boolean @default(false)  // v2
}

model SlokamTemplate {
  id               Int      @id @default(autoincrement())
  name             String
  slokamsPerBhakta Int
  uploadedFile     Bytes                     // original .xlsx, ≤ 1 MB
  createdAt        DateTime @default(now())
  rows             TemplateRow[]
}

model TemplateRow {
  id            Int     @id @default(autoincrement())
  templateId    Int
  sheetOrder    Int
  section       String
  fromText      String?
  toText        String?
  rowKind       RowKind
  unitNo        Int                          // fill unit: lines sharing one "Allocated to" cell (§6)
  prefilledName String?
  template      SlokamTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  @@unique([templateId, sheetOrder])
}

model Satsang {
  id            Int       @id @default(autoincrement())
  batchId       Int
  seq           Int                          // 1, 2, 3… per batch; drives rotation
  title         String    @default("Satsang")
  startsAt      DateTime
  opensAt       DateTime
  closesAt      DateTime
  publishAt     DateTime
  templateId    Int?
  stateOverride String?                      // "open" | "closed" | null
  status        SatsangStatus @default(SCHEDULED)
  publishPaused Boolean   @default(false)    // v2: admin pause of auto-publish
  publishedAt   DateTime?
  updatedAt     DateTime  @updatedAt
  @@unique([batchId, seq])
  @@unique([batchId, startsAt])
}

model Response {
  id          Int      @id @default(autoincrement())
  satsangId   Int
  bhaktaId    Int
  choice      Choice
  submittedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([satsangId, bhaktaId])
}

model RejectedAttempt {
  id          Int      @id @default(autoincrement())
  satsangId   Int
  enteredName String
  attemptedAt DateTime @default(now())
}

model AllocationRow {
  id             Int       @id @default(autoincrement())
  satsangId      Int
  templateRowId  Int
  sheetOrder     Int
  section        String
  fromText       String?
  toText         String?
  rowKind        RowKind
  unitNo         Int                         // copied from TemplateRow; lines in a unit share primary and backup
  prefilledName  String?
  backupGroup    Int?
  primaryBhaktaId Int?
  backupBhaktaId  Int?
  coveredById     Int?                       // A12: who actually chanted it
  status         RowStatus @default(ASSIGNED)
  @@unique([satsangId, sheetOrder])
}

model AuditLog {
  id        Int      @id @default(autoincrement())
  satsangId Int?
  actor     Actor
  action    String                           // "vote", "open", "generate", "swap", …
  before    Json?
  after     Json?
  at        DateTime @default(now())
}

model RateLimitHit {
  key       String                           // sha256(ip + daily salt)
  windowEnd DateTime
  count     Int
  @@id([key, windowEnd])
}
```

Notes:
- `AllocationRow` copies the template row's text so later template edits never change a published sheet. All rows (including pre-filled) are copied so the grid renders straight from this table.
- The standby list (spec step 6) is not stored; it is derived as `pool − bhaktas with a row`.
- **Design decision (confirmed Nov 2):** `Satsang.seq` gives the weekly rotation offset; it never changes once created, which keeps regeneration deterministic.

## 4. Lifecycle and scheduling

The Vercel free plan allows one cron run per day, so the portal **derives state from the clock on every request** and performs any due transition lazily.

### Effective state

```ts
function effectiveState(s: Satsang, schedule: WeeklySchedule, now: Date): SatsangStatus {
  if (s.status === "PUBLISHED" || s.status === "COMPLETED") return s.status;
  if (s.stateOverride === "open")   return "OPEN";
  if (s.stateOverride === "closed") return s.status === "ALLOCATED" ? "ALLOCATED" : "CLOSED";
  if (!schedule.autoMode) return s.status;            // v1: admin clicks drive status
  // v2: clock drives status
  if (now < s.opensAt)  return "SCHEDULED";
  if (now < s.closesAt) return "OPEN";
  if (now < s.publishAt || s.publishPaused) return s.status === "ALLOCATED" ? "ALLOCATED" : "CLOSED";
  return "PUBLISHED";                                   // persisted lazily, see below
}
```

`COMPLETED` is applied (stored or derived) once `now > startsAt + 3h`.

### Lazy transitions (v2)

`ensureUpToDate(satsangId)` runs at the top of every public and admin page load:

1. If clock state is past `closesAt` and no allocation exists → generate using the satsang's admin-chosen template (§5.1), set `ALLOCATED`.
2. If past `publishAt`, allocation exists, not paused, and the generate step didn't flag a hold → set `PUBLISHED`, `publishedAt = now`.

Both steps run inside a transaction that first takes `SELECT pg_advisory_xact_lock(satsangId)` and re-reads the row, so two simultaneous visitors cannot generate twice. Each step writes an `AuditLog` row with `actor = SCHEDULER` and is idempotent.

### Daily cron backstop — `/api/cron/daily`

Runs once a day (e.g. 01:00 IST). Protected by `Authorization: Bearer ${CRON_SECRET}`.

1. Mark past satsangs `COMPLETED`.
2. If no future satsang exists for the batch, create the next one from `WeeklySchedule` (v2; in v1 the admin creates it, prefilled from the same function).
3. Call `ensureUpToDate` for the current satsang (covers weeks with zero traffic).

### Computing a week's times

`nextSatsangTimes(schedule, after)` returns `startsAt`, then `opensAt`/`closesAt`/`publishAt` as the most recent configured weekday/time **before** `startsAt` (Mon 06:00, Tue 23:59, Wed 06:00 for a Sat 19:00 satsang). All arithmetic uses `date-fns-tz` in `Asia/Kolkata` and is converted to UTC for storage.

### Overdue steps (v1)

The admin dashboard compares the stored status with the configured times; if the clock says "should be open/closed/published" and the status lags, that step is shown in red with its button.

## 5. Allocation engine (`lib/allocation.ts`)

A pure function. No database access, no `Date.now()`, no randomness.

```ts
type Input = {
  rows: TemplateRow[];                 // sorted by sheetOrder
  pool: { id: number; listOrder: number; choice: "AVAILABLE" | "BACKUP" }[];
  seq: number;                         // Satsang.seq
};
type Output = {
  rows: AllocationRowDraft[];
  standby: number[];                   // bhakta ids with no row (more bhaktas than blocks)
  warnings: Warning[];                 // NO_BACKUPS, UNCOVERED_OWN_BLOCK, STANDBY, NO_CHANTERS
};
```

### 5.1 Template selection

**The admin always chooses the template, in v1 and v2.** The system never picks one on its own.

- **Picker:** lists every template as "*name* — *N* per bhakta — *blocks* blocks for *chanters* chanters (*k* on standby / *k* double)". Each satsang starts with the schedule's default template preselected (`Satsang.templateId`), and the admin can change it at any time before or after generating.
- **v1:** the admin picks the template, then clicks Generate.
- **v2:** the automatic generate step (§4) uses the template already set on the satsang, which is the default unless the admin changed it. If that template has fewer blocks than chanters, extra bhaktas go on standby, `publishPaused` is set, and the dashboard alerts the admin to choose another template and regenerate.
- "Block count" = rows to fill: kind `BLOCK`, `NAMED_PART` or `SINGLE_PRAYER` (everything except pre-filled rows).

### 5.2 Steps

1. **Pool order.** Sort A + B bhaktas by `listOrder`, then rotate left by `seq mod pool.length`. Excluded: inactive bhaktas, responses from deactivated bhaktas, non-list names (never in `Response`).
2. **Rows to fill.** The fill units (§6) that contain `BLOCK`, `NAMED_PART` or `SINGLE_PRAYER` lines, in sheet order (pre-filled units skipped). Everywhere in §5, "row" means a fill unit: all lines in a unit get the same bhakta and the same backup.
3. **Fill top to bottom.** Walk the pool; row *i* → `pool[i mod pool.length]`. Opening Prayer, Pledge and Closing Prayer are filled in their place like any other row, so the first bhakta in this week's order gets Opening Prayer (as in the sample sheet). When rows ≥ pool this wraps from the top with no warning (spec step 5). When pool > rows, the remaining bhaktas form `standby` and a `STANDBY` warning is raised (spec step 6).
4. *(Merged into step 3 — decided Nov 2.)*
5. **Pre-filled rows** are copied with `prefilledName` and no bhakta as primary.
6. **Backup groups.** Let `R` = all rows that need a backup (blocks + single prayers + pre-filled rows such as VISVAS) in sheet order, `B` = backup-willing bhaktas in pool order, `k = |B|`.
   - `k = 0` → no backups; `NO_BACKUPS` warning.
   - Otherwise split `R` into `k` contiguous groups; the first `|R| mod k` groups get one extra row. Group *g* → `B[(g + r) mod k]`, where the rotation `r` (0…k−1) is the first one with the fewest rows whose chanter is their own group's backup (decided Nov 4). This keeps one backup across a whole group, e.g. Opening Prayer + Pledge + early Poorvangam, instead of handing single prayers to someone else.
   - For any row still clashing (its primary is its group's backup), the backup is the next group's backup; if `k = 1`, no backup and an `UNCOVERED_OWN_BLOCK` warning.
   - **Design decision (confirmed Nov 2):** single prayers and pre-filled rows (VISVAS) are included in backup groups and get a backup like any other row, matching the sketch in the spec. A pre-filled row has no bhakta as primary, so the "own block" rule never applies to it.
7. **Zero chanters** → no output; `NO_CHANTERS` (Generate is blocked; v2 holds publish).

Worked example from the spec (10 rows, 10 chanters, Ravi on row 3 and Meena on row 8 as the two backups) is the first unit test.

### 5.3 Generate / regenerate / edits

- **Generate** deletes this satsang's `AllocationRow`s and inserts the new ones in one transaction; audit `generate` with template id and pool size.
- **Switch template** after generating shows a confirm dialog, then regenerates (spec edge case).
- **Admin edits (A9):** swap two rows' primaries, reassign a row's primary or backup to any active bhakta, clear a row. Each edit writes `AuditLog` with before/after. Edits are allowed before and after publishing; editing a published allocation updates "Last updated".
- **Drop-out (A12):** mark a row `DROPPED` and set `coveredById` = the named backup (or another bhakta), status `COVERED`. The public grid shows the covering bhakta with a "covered for *name*" note.

## 6. Template import (`lib/templates.ts`)

Parsed with `exceljs`. Checked against the sample `A2322-Allocation.xlsx` (two sheets: "Satsang Chart" for A2322 Tamil, 54 rows; "Trail Satsang-2" for a Telugu batch, 55 rows).

**Templates for A2322** (columns A–E of the "Satsang Chart" sheet in each file; also copied to `tests/fixtures/`):

| Template | File | Lines | Fill units | Typical block |
| --- | --- | --- | --- | --- |
| Short blocks | `A2322-Allocation.xlsx` | 54 | 53 + VISVAS | 3–4 slokams |
| Long blocks | `satsang 12 allocation list.xlsx` | 31 | 28 + VISVAS | 6–7 slokams |

The admin names each template and sets its slokams-per-bhakta label on upload. The second sheet in both files ("Trail Satsang-2") is a different batch (A1070 Telugu) and is not a template for A2322.

**Sheets:** when a file has more than one sheet, the preview lists them and the admin ticks which to import (default: the first); each ticked sheet is saved as a separate template.

**Fill units (from the satsang 12 sheet).** In the long-block sheet, one block spans two physical rows (A8:A9, B8:B9, C8:C9 and D8:D9 are merged), and some "Allocated to" cells cover two different lines. For example, D12:D13 gives one bhakta Poorvangam 19–22 **and** Poorvanyasam, and D16:D17 gives one bhakta Dhyanam 6–8 **and** VSN-Mahamantra 1–4. So the parser works in two levels:

- **Line** = one row in the output. Cells merged vertically in A–C (e.g. A8:A9) form one line; the empty second physical row is not a separate line.
- **Fill unit** = one "Allocated to" cell, merged or not. All lines it covers form one unit (`TemplateRow.unitNo`) and are given to one bhakta. For prayers, the merged B–D cell is the unit.

In the short-block sheet every line is its own unit, so both layouts are handled by the same rule.

| Sheet rows | Handling |
| --- | --- |
| 1–3 | Header lines (merged across B–D) — ignored on import; the portal writes batch name, date/time and title each week |
| 4 | Must read `Shlokas · From · To · Allocated to · Backup` in columns A–E (case-insensitive); otherwise reject with a clear error |
| 5+ | One `TemplateRow` per row with a Shlokas value, up to and including Closing Prayer |

**Only columns A–E are read.** The sample has helper lists to the right (columns H–J: a backup roster and name lists used to fill the sheet by hand); these are ignored.

**Numbers:** Excel stores From/To as decimals (`1.0`, `108.0`); they are converted to whole numbers.

**Past allocation uploaded as a template:** the sample is a filled-in sheet, not a blank template. If "Allocated to" is filled on most rows, the portal treats the file as a past allocation: all names in Allocated to, Backup and merged prayer cells are cleared, and only fixed names (default list: `VISVAS`, editable on the templates page) stay as pre-filled rows. The preview shows this before saving. So the admin can upload last week's sheet directly.

Row kind detection (in this order):

1. "Allocated to" holds a fixed name (VISVAS) → `PREFILLED`.
2. Section is Opening Prayer, Pledge or Closing Prayer, or From–Allocated to (B–D) is one merged cell → `SINGLE_PRAYER`. In the sample the prayer's chanter name sits in that merged B–D cell.
3. From and To are both numbers → `BLOCK`.
4. Otherwise (text in From, e.g. "Poorvanyasam" merged across B–C) → `NAMED_PART`.

A blank Section cell inherits the section above. After upload the admin sees a preview table with the detected kinds and block count, and can correct a row's kind before saving. Limit: 1 MB, `.xlsx` only.

Expected result for "Satsang Chart": 54 rows = 3 single prayers, 1 pre-filled (VISVAS, Poorvangam 1–5), 1 named part (Poorvanyasam), 49 blocks → 53 units to fill. The sample had 46 chanters, so the list wrapped and 7 people got a second row.

Expected result for the satsang 12 sheet: 3 prayers + 25 merged "Allocated to" cells = 28 units to fill, plus VISVAS. That week (Sat 11 Oct 2026, 7:00 pm) had 16 chanters, so the list wrapped and 12 people got a second unit.

**The satsang 12 sheet confirms the allocation rules:**
- Filled top to bottom with prayers in place: the first chanter got Opening Prayer, the second Pledge, and so on down, wrapping to the top (decision 10).
- 5 backups, all of them chanters from that week, each covering one contiguous group (`E5:E13`, `E14:E23`, `E24:E35`, `E36:E47`, `E48:E58`), and none covers their own unit (spec rules 7–8, decision 11).
- One merged "Allocated to" cell can cover lines from two sections, so units must be read from the merges, not from the section names.

**Output = columns A–E.** What participants see on `/allocation`, the print/PDF page and the XLSX download is exactly the template's columns A–E (Shlokas · From · To · Allocated to · Backup) under the three header lines, nothing else. The output keeps the template's merges: blocks spanning two physical rows, "Allocated to" cells merged across a unit, prayers merged across B–D, and Backup merged across each backup group. On the web page the same merges become `rowspan`; on phones each unit is one card listing its lines.

**Export layout** matches the sample: prayers' names written into a merged B–D cell, Poorvanyasam merged B–C, backup names in column E merged over each backup's rows (e.g. `E5:E9`).

**Master-list import (A2)** uses the same library and accepts the batch's existing contacts export as is (sample: `Master csv copy.xlsx`, 76 rows). That file has four columns: a short name (col A, no header, sometimes blank), the same name with a batch prefix (col B, header "Name", e.g. "A2322-" followed by the short name), a phone number (col C) and a nickname (col D).

Import flow:

1. **Upload** `.xlsx` or `.csv`; the first sheet is read.
2. **Column A is the master copy.** Names are read from column A only. Header-like first row ("Name") and blank cells are skipped.
3. **Only column A is read.** Columns B–D (prefixed name, phone number, nickname) are never read into the app or stored (PRD privacy rule). The uploaded file itself is not kept.
4. **Blank rows are listed** in the preview with their row number so the admin can fill column A and re-upload, or add the name by hand. In the sample, row 9 has column A blank and would otherwise be missed.
5. **Preview with warnings** before saving. Each row shows the name and flags for the admin to fix or skip:
   - looks like an email (contains `@`), e.g. "Someone81@Gmail.Com";
   - contains digits or looks like a placeholder, e.g. "2 person";
   - all lowercase or ALL CAPS (shown so the admin can tidy spelling, since bhaktas must type it exactly);
   The admin can edit any name inline in the preview, untick rows, then click Import.
6. List order = row order in the file.

**Duplicate names are allowed and merged.** A name that repeats (same `nameKey`, i.e. same spelling ignoring case and outer spaces) is treated as the same person and kept as one entry:

- **Within a file:** the first occurrence is kept with its list position; later repeats are skipped.
- **Already on the list:** the existing entry is kept as is (and reactivated if it was deactivated); no new entry is created.
- **Adding one name by hand:** same rule. The admin sees "Already on the list" and nothing else changes.
- **Renaming onto a name that already exists:** refused with "Already on the list", since that would merge two existing entries and their responses.
- After an import the admin sees a summary: *added*, *already on the list*, *merged within file* (with the names), *reactivated*. Nothing is rejected because of duplicates.

Consequence: two real people with exactly the same name share one entry, one vote and one block. If that matters, the admin can give them distinct names (e.g. "Lakshmi R." / "Lakshmi S.").

## 7. Name matching (`lib/names.ts`)

```ts
export const normaliseName = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase("en");
```

- Case-insensitive, trims leading/trailing spaces, **does not** collapse inner spaces (spec edge case: extra inner spaces are refused).
- Unicode NFC so names typed on different phones compare equal.
- Lookup: `Bhakta` where `batchId` and `nameKey` match and `active = true`.
- No match → insert `RejectedAttempt`, show the B3 message verbatim.

## 8. Public pages

### `/` — Home (B1–B6)
- Banner shows the effective state: "Voting opens Monday 6:00 am", "Voting open until Tue 11:59 pm", "Voting closed — allocation will be shared Wednesday morning", or "Allocation published" with a link.
- Form (only while OPEN): name text input, three radio options (Available / Not available / Available + willing to be a backup), hidden honeypot field `website`, submit.
- Server action: honeypot filled → pretend success, store nothing; rate-limit check; state re-checked server-side (never trust the page); upsert `Response`; audit `vote` (bhakta id, choice); confirmation shows the stored choice and timestamp in IST.

### `/allocation` (B7–B8)
- Before publish: "Allocation will be shared on Wednesday morning" (never shows the previous week).
- After publish: three header lines, download buttons, "Find your name" search box (client-side filter/highlight, no request), the grid grouped by section, "Last updated" in IST.
- **Desktop (≥ 640 px):** a real `<table>` with backup cells using `rowspan` across each backup group.
- **Phone (< 640 px):** each row becomes a card with the same five fields in the same order, large text; backup shown on every card of the group.

### `/allocation/print` (PDF)
Print stylesheet: A4 portrait, table layout, repeating header row, no navigation. The "Download PDF" button opens this page and calls `window.print()` so the browser's Save as PDF handles Devanagari correctly. Font stack: `"Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif` via `next/font`.

### XLSX export — `/api/export/[satsangId]/xlsx` (A11, B8)
`exceljs` writes the template layout: rows 1–3 headers, row 4 column headings, then all rows; backup column cells are merged across each backup group (`ws.mergeCells`). Public access only when published; admins can download drafts.

## 9. Admin pages

| Route | Main pieces |
| --- | --- |
| `/admin` | This week's card: state, times, next step (red when overdue), response counts, buttons Open / Close / Generate / Publish (v1), auto-mode status and alerts (v2) |
| `/admin/bhaktas` | Table (name, order, active), add, rename, drag or number to reorder, deactivate, CSV/XLSX import |
| `/admin/templates` | Upload, preview with detected row kinds, slokams-per-bhakta, set default |
| `/admin/schedule` | Day/time pickers in IST, default template, auto-mode toggle |
| `/admin/satsangs/[id]/responses` | Five tabs/lists: Available, Backup, Not available, No response, Not on list; counts; CSV copy |
| `/admin/satsangs/[id]/allocation` | Template picker with block-vs-chanter counts, Generate, editable grid (swap / reassign / clear), warnings panel, standby list, Publish/Unpublish, Pause auto-publish (v2), drop-out recording, XLSX/print, audit trail |
| `/admin/account` | Change password (current + new ×2, min 10 chars) |

Responses lists are computed with one query each; ≤ 500 names needs no pagination.

## 10. Security

**Admin auth (A1)**
- `bcrypt` cost 12. Initial account created by `prisma/seed.ts` from `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD` env vars, with `mustChangePassword = true`.
- **First login:** while `mustChangePassword` is true, every admin page and action redirects to `/admin/account`, which asks for a new password (min 10 chars, must differ from the initial one). Saving it clears the flag, deletes other sessions, and opens the dashboard.
- Login: if `lockedUntil > now` → refuse. Wrong password → `failedAttempts++`; at 5 → `lockedUntil = now + 15 min`, reset counter. Success → reset counter.
- Session: 32 random bytes in an `HttpOnly; Secure; SameSite=Lax` cookie; DB stores only its SHA-256. Expires after 7 days without activity (`lastSeenAt` refreshed at most once an hour). Password change deletes all sessions.
- `middleware.ts` redirects `/admin/**` (except `/admin/login`) when the cookie is missing; the protected layout and every admin server action re-validate against the DB.
- Server Actions get Next.js's built-in origin check against CSRF; `SameSite=Lax` adds a second layer.

**Public form abuse**
- Rate limit: 10 submissions per IP per 10 min. Key = SHA-256(IP + daily rotating salt), stored in `RateLimitHit`; rows older than 1 day deleted by the daily cron. Raw IPs are never stored.
- Honeypot field.
- Impersonation (someone voting under another name) is accepted by design; the audit log keeps every overwrite.

**General**
- HTTPS only (Vercel). Secrets in Vercel env vars: `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET`, `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`.
- Passwords never logged; audit `before/after` never includes credentials.
- Input validation with `zod` on every server action and upload.

## 10a. Supabase specifics (added Nov 5)

- **Connections:** the app uses `DATABASE_URL` = Supabase *Transaction pooler* (port 6543), suited to Vercel's short-lived functions. Prisma CLI (migrations, seed) uses `DIRECT_URL` = *Session pooler* (port 5432). See `prisma.config.ts`.
- **Data API locked:** Supabase exposes tables in `public` through its Data API. Migration `enable_row_level_security` turns on row-level security with no policies on every table, so that API can read or change nothing. The app connects as the table owner and is not affected.
- **Free-tier pause:** Supabase pauses free projects after about a week without activity. Weekly use plus the daily backstop job keep it awake.

## 11. Non-functional

| Concern | Approach |
| --- | --- |
| Performance | Server-rendered pages with minimal JS; only the search box and admin grid are client components. Supabase transaction pooler (port 6543) for the app; session pooler (5432) for migrations |
| Accessibility | Semantic HTML, `<label>` for every input, radio group in `<fieldset>`, focus styles, colour contrast ≥ 4.5:1, state banner as text not colour alone |
| Mobile | Designed at 360 px first; tap targets ≥ 44 px; base font 18 px on public pages |
| Unicode | UTF-8 everywhere; Noto fonts for Devanagari |
| Backups | Supabase daily backups (free tier keeps a short window) plus a weekly admin "Export all" (master list + last allocation XLSX) as the rollback path |
| Audit retention | Cron deletes `AuditLog` rows older than 12 months |
| Observability | Vercel logs; scheduler actions visible in the admin audit trail |

## 12. Testing

- **Unit (Vitest):** `allocation.ts` — spec worked example; fewer bhaktas than blocks (wrap); more bhaktas than blocks (standby); 0 / 1 / many backups; own-block-in-own-group; rotation by `seq`; determinism (same input twice). `names.ts` — case, trim, inner spaces, NFC. `templates.ts` — the sample `A2322 Allocation.xlsx` parses into the expected kinds. `lifecycle.ts` — effective state at boundary times in IST.
- **Integration:** server actions against local Postgres: vote → overwrite → closed refusal; lazy generate called twice concurrently produces one allocation.
- **E2E (Playwright, 360 px and desktop):** vote flow, not-on-list message, published allocation search and print page, admin login lockout.

## 13. Build plan

| Milestone | Scope |
| --- | --- |
| M1 Foundations | Next.js + Prisma + Supabase + Vercel deploy; schema & seed; admin login/session/lockout |
| M2 Master list & templates | A2 incl. import; A6 upload/parse/preview; A3 schedule |
| M3 Voting | A4, A5 (v1 buttons), B1–B6, rate limit, A7 dashboard |
| M4 Allocation | Engine + tests, A8 picker/generate, A9 edits, A10 publish, B7 page |
| M5 Export & polish | A11/B8 XLSX + print PDF, A12 drop-outs, accessibility pass → dummy week (rollout step 1) |
| M6 v2 automation | Auto-mode: lazy transitions using the admin-chosen template, daily cron, pause/alerts |

## 14. Open items

- Sample files received Nov 2: `A2322-Allocation.xlsx` (parser rules in §6 updated to match) and `Master csv copy.xlsx` (master-list import updated). Test copies are in `tests/fixtures/`: `A2322-Allocation.xlsx` and `master-list-names.csv` (column A only, no phone numbers; the original master list should not be committed).
- Backups: the A2322 sample uses 5 people who are not on the master list and don't chant. Decided Nov 2 to keep the spec instead: backups are bhaktas who vote "Available + backup" and also chant. Those 5 people need to be on the master list and vote that option to be backups.
- PRD evidence and baseline metrics are still marked [NEED]; they don't block the build.

## 15. Design decisions (confirmed Nov 2, 2026)

| # | Decision | Where |
| --- | --- | --- |
| 1 | Weekly rotation: chanters in master-list order, start point shifted by the satsang's sequence number (`seq mod pool size`) | §3, §5.2 |
| 2 | Every row gets a backup: blocks, Opening Prayer, Pledge, Closing Prayer and the pre-filled VISVAS row are all included in backup groups | §5.2 |
| 3 | After a template upload the admin sees the detected row types and can correct them before saving | §6 |
| 4 | Template is always chosen by the admin, in v1 and v2 (no automatic selection) | §5.1 |
| 5 | Duplicate names are merged into one entry; renaming onto an existing name is refused | §6 |
| 6 | Initial admin account comes from hosting env vars; the password must be changed at first login; passwords ≥ 10 characters | §10 |
| 7 | Daily backstop job runs at 1:00 am IST | §4 |
| 8 | A satsang is marked completed 3 hours after it starts | §4 |
| 9 | Phone layout (stacked cards) below 640 px wide; table at 640 px and above | §8 |
| 10 | All rows, including Opening Prayer, Pledge and Closing Prayer, are filled top to bottom in sheet order, as in the sample sheet | §5.2 |
| 11 | Backups stay as in the spec (bhaktas who vote "Available + backup"), not the sample's separate roster | §5.2, §14 |
| 12 | A past allocation sheet can be uploaded as a template; names are cleared except fixed names (VISVAS); only columns A–E are read; admin picks the sheet | §6 |
| 14 | Two A2322 templates: short blocks (`A2322-Allocation.xlsx`) and long blocks (`satsang 12 allocation list.xlsx`); one "Allocated to" cell = one fill unit, even when it covers several lines; columns A–E with their merges are the participant output | §6 |
| 13 | Master-list import: column A is the master copy and the only column read; phone/nickname columns never read; blank column A cells listed for the admin | §6 |
