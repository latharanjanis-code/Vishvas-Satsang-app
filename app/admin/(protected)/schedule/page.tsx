// Weekly schedule (spec A3). All times IST.
import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, getBatch } from "@/lib/db";
import { DAY_NAMES, nextSatsangTimes, shortIST } from "@/lib/time";
import { saveScheduleAction } from "../../schedule-actions";
import { Flash, PageTitle, flashFrom, type SP } from "../../ui";

export default function SchedulePage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function DayTime({ label, name, day, time }: { label: string; name: string; day: number; time: string }) {
  return (
    <fieldset className="grid grid-cols-[1fr_auto] gap-2 items-end">
      <legend className="label">{label}</legend>
      <select name={`${name}Day`} defaultValue={day} className="input" aria-label={`${label} day`}>
        {DAY_NAMES.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
      <input name={`${name}Time`} type="time" defaultValue={time} className="input w-32" aria-label={`${label} time`} required />
    </fieldset>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  await connection();
  await requireAdmin();
  const flash = await flashFrom(searchParams);
  const batch = await getBatch();
  const s = batch.schedule!;
  const templates = await db.slokamTemplate.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } });
  const next = nextSatsangTimes(s, new Date());

  return (
    <>
      <PageTitle sub="All times are India time (IST).">Weekly schedule</PageTitle>
      <Flash {...flash} />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] items-start">
        <form action={saveScheduleAction} className="card space-y-4">
          <div>
            <label htmlFor="batchName" className="label">
              Batch name (first header line)
            </label>
            <input id="batchName" name="batchName" defaultValue={batch.name} className="input" required />
          </div>
          <DayTime label="Satsang" name="satsang" day={s.satsangDay} time={s.satsangTime} />
          <DayTime label="Voting opens" name="open" day={s.openDay} time={s.openTime} />
          <DayTime label="Voting closes" name="close" day={s.closeDay} time={s.closeTime} />
          <DayTime label="Allocation published" name="publish" day={s.publishDay} time={s.publishTime} />
          <div>
            <label htmlFor="defaultTemplateId" className="label">
              Default template
            </label>
            <select id="defaultTemplateId" name="defaultTemplateId" defaultValue={s.defaultTemplateId ?? ""} className="input">
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-line p-3">
            <input type="checkbox" name="autoMode" defaultChecked={s.autoMode} className="mt-1 size-4" />
            <span>
              <strong>Auto mode (v2)</strong>
              <span className="block text-sm text-muted">
                Voting opens and closes on time, the allocation is generated with the chosen template, and it is published at the publish time —
                unless you pause it. The next satsang is created automatically each day by the backstop job.
              </span>
            </span>
          </label>
          <button className="btn">Save schedule</button>
        </form>

        <section className="card text-sm space-y-1">
          <h2 className="font-semibold mb-1">With these settings, the next week is</h2>
          <p>Voting opens: {shortIST(next.opensAt)}</p>
          <p>Voting closes: {shortIST(next.closesAt)}</p>
          <p>Published: {shortIST(next.publishAt)}</p>
          <p>Satsang: {shortIST(next.startsAt)}</p>
          <p className="text-muted pt-2">Changes apply to satsangs created after saving.</p>
        </section>
      </div>
    </>
  );
}
