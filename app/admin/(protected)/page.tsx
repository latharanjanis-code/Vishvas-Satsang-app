// This week's satsang: status, counts, next step (spec A4, A5, A7).
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, getBatch } from "@/lib/db";
import { currentSatsang, effectiveStatus, ensureUpToDate, overdueStep } from "@/lib/satsangs";
import { responseSummary } from "@/lib/responses";
import { STATUS_LABEL } from "@/lib/labels";
import { shortIST } from "@/lib/time";
import { createSatsangAction, setVotingAction } from "../satsang-actions";
import { Flash, PageTitle, flashFrom, type SP } from "../ui";

export default function Dashboard({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  await connection();
  await requireAdmin();
  const flash = await flashFrom(searchParams);
  const now = new Date();
  const batch = await getBatch();
  let s = await currentSatsang(batch.id, now);
  if (s) {
    await ensureUpToDate(s.id, now);
    s = await currentSatsang(batch.id, now);
  }
  const auto = batch.schedule?.autoMode ?? false;
  const recent = await db.satsang.findMany({ where: { batchId: batch.id }, orderBy: { startsAt: "desc" }, take: 6 });

  if (!s) {
    return (
      <>
        <PageTitle sub={batch.name}>This week</PageTitle>
        <Flash {...flash} />
        <div className="card space-y-3 max-w-xl">
          <p>There is no upcoming satsang yet.</p>
          <form action={createSatsangAction}>
            <button className="btn">Create next satsang</button>
          </form>
          <p className="text-sm text-muted">Dates come from the weekly schedule.</p>
        </div>
        <Recent list={recent} />
      </>
    );
  }

  const status = effectiveStatus(s, auto, now);
  const overdue = auto ? null : overdueStep(s, status, now);
  const summary = await responseSummary(s.id, batch.id);
  const rows = await db.allocationRow.count({ where: { satsangId: s.id } });

  const steps = [
    { key: "open", label: "Voting opens", at: s.opensAt },
    { key: "close", label: "Voting closes", at: s.closesAt },
    { key: "publish", label: "Allocation published", at: s.publishAt },
    { key: "satsang", label: "Satsang", at: s.startsAt },
  ];

  return (
    <>
      <PageTitle sub={batch.name}>This week</PageTitle>
      <Flash {...flash} />
      {s.holdReason && (
        <p className="rounded-lg bg-bad-soft text-bad px-3 py-2 mb-4 font-medium">Auto-publish is on hold: {s.holdReason}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <span className="chip">{STATUS_LABEL[status]}</span>
            <span className="text-sm text-muted">{auto ? "Auto mode (v2)" : "Manual mode (v1)"}</span>
          </div>
          <ol className="space-y-1">
            {steps.map((st) => (
              <li key={st.key} className={`flex justify-between gap-3 ${overdue === st.key ? "text-bad font-semibold" : ""}`}>
                <span>
                  {st.label}
                  {overdue === st.key && " — overdue"}
                </span>
                <span className="tabular-nums">{shortIST(st.at)}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2">
            {(status === "SCHEDULED" || (status === "CLOSED" && rows === 0)) && (
              <form action={setVotingAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="to" value="open" />
                <button className={`btn ${overdue === "open" ? "btn-danger" : ""}`}>Open voting</button>
              </form>
            )}
            {status === "OPEN" && (
              <form action={setVotingAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="to" value="close" />
                <button className={`btn ${overdue === "close" ? "btn-danger" : ""}`}>Close voting</button>
              </form>
            )}
            <Link href={`/admin/satsangs/${s.id}/allocation`} className={`btn ${overdue === "publish" ? "btn-danger" : "btn-quiet"}`}>
              {rows ? "Allocation" : "Template & allocation"}
            </Link>
            <Link href={`/admin/satsangs/${s.id}/responses`} className="btn btn-quiet">
              Responses
            </Link>
          </div>
        </section>

        <section className="card">
          <h2 className="font-semibold mb-2">Responses</h2>
          <dl className="grid grid-cols-2 gap-2 text-center">
            {[
              ["Available", summary.available.length, "text-ok"],
              ["Backup", summary.backup.length, "text-ok"],
              ["Not available", summary.notAvailable.length, ""],
              ["No response", summary.noResponse.length, "text-warn"],
              ["Not on list", summary.rejected.length, "text-bad"],
              ["Chanters", summary.available.length + summary.backup.length, "text-accent"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="rounded-lg bg-bg py-2">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className={`text-2xl font-bold tabular-nums ${tone}`}>{n}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted mt-2">{summary.total} names on the master list.</p>
        </section>
      </div>

      <div className="mt-6 flex gap-2">
        <form action={createSatsangAction}>
          <button className="btn btn-quiet btn-sm">Create the following week</button>
        </form>
      </div>
      <Recent list={recent} />
    </>
  );
}

function Recent({ list }: { list: { id: number; title: string; startsAt: Date; status: keyof typeof STATUS_LABEL }[] }) {
  if (list.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="font-semibold mb-2">Recent and upcoming</h2>
      <ul className="card divide-y divide-line !p-0">
        {list.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <span className="font-medium">{x.title}</span>
            <span className="text-sm text-muted">{shortIST(x.startsAt)}</span>
            <span className="chip">{STATUS_LABEL[x.status]}</span>
            <span className="ml-auto flex gap-3 text-sm">
              <Link className="underline" href={`/admin/satsangs/${x.id}/responses`}>
                Responses
              </Link>
              <Link className="underline" href={`/admin/satsangs/${x.id}/allocation`}>
                Allocation
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
