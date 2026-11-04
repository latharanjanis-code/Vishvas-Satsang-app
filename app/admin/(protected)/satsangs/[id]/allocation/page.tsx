// Choose template, generate, edit, publish, export, record drop-outs (spec A8–A12).
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fillUnitCount } from "@/lib/allocation";
import { loadGrid } from "@/lib/grid";
import { effectiveStatus, ensureUpToDate } from "@/lib/satsangs";
import { STATUS_LABEL } from "@/lib/labels";
import { shortIST } from "@/lib/time";
import {
  clearAllocationAction,
  generateAction,
  publishAction,
  swapUnitsAction,
  updateSatsangAction,
} from "../../../../satsang-actions";
import { ConfirmButton } from "../../../../client-bits";
import { AllocationEditor } from "./editor";
import { Flash, PageTitle, flashFrom, type SP } from "../../../../ui";

type Props = { params: Promise<{ id: string }>; searchParams: SP };

export default function AllocationAdminPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  await connection();
  await requireAdmin();
  const flash = await flashFrom(searchParams);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  await ensureUpToDate(id);
  const s = await db.satsang.findUnique({ where: { id }, include: { batch: { include: { schedule: true } } } });
  if (!s) notFound();
  const now = new Date();
  const auto = s.batch.schedule?.autoMode ?? false;
  const status = effectiveStatus(s, auto, now);

  const [templates, responses, bhaktas, rowsCount, log] = await Promise.all([
    db.slokamTemplate.findMany({
      orderBy: { id: "asc" },
      include: { rows: { select: { sheetOrder: true, rowKind: true, unitNo: true } } },
    }),
    db.response.findMany({
      where: { satsangId: id, choice: { in: ["AVAILABLE", "BACKUP"] }, bhakta: { active: true } },
      include: { bhakta: true },
    }),
    db.bhakta.findMany({ where: { batchId: s.batchId, active: true }, orderBy: { listOrder: "asc" } }),
    db.allocationRow.count({ where: { satsangId: id } }),
    db.auditLog.findMany({ where: { satsangId: id, actor: { not: "BHAKTA" } }, orderBy: { at: "desc" }, take: 25 }),
  ]);
  const chanters = responses.length;
  const chanterIds = new Set(responses.map((r) => r.bhaktaId));
  const backupIds = new Set(responses.filter((r) => r.choice === "BACKUP").map((r) => r.bhaktaId));
  const grid = rowsCount ? await loadGrid(id) : null;

  // Derived warnings.
  const assigned = new Set(grid?.lines.map((l) => l.primaryBhaktaId).filter(Boolean));
  const standby = grid ? responses.filter((r) => !assigned.has(r.bhaktaId)).map((r) => r.bhakta.name) : [];
  const noBackup = grid ? grid.lines.filter((l) => l.unitSpan > 0 && !l.backupBhaktaId).length : 0;
  const closed = status !== "SCHEDULED" && status !== "OPEN";

  const units = grid ? grid.lines.filter((l) => l.unitSpan > 0) : [];
  const unitLabel = (unitNo: number) =>
    grid!.lines
      .filter((l) => l.unitNo === unitNo)
      .map((l) => (l.toText ? `${l.section} ${l.fromText}–${l.toText}` : l.fromText ? `${l.section} ${l.fromText}` : l.section))
      .join(" + ");

  return (
    <>
      <PageTitle sub={`${shortIST(s.startsAt)} IST · publish ${shortIST(s.publishAt)} IST`}>
        Allocation · {s.title} <span className="chip align-middle">{STATUS_LABEL[status]}</span>
      </PageTitle>
      <p className="mb-4 flex gap-4 text-sm">
        <Link className="underline" href="/admin">
          ← This week
        </Link>
        <Link className="underline" href={`/admin/satsangs/${id}/responses`}>
          Responses
        </Link>
      </p>
      <Flash {...flash} />
      {s.holdReason && <p className="rounded-lg bg-bad-soft text-bad px-3 py-2 mb-4 font-medium">Auto-publish on hold: {s.holdReason}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">1. Template for this week</h2>
          <p className="text-sm text-muted">
            {chanters} chanters ({backupIds.size} willing to be backup).
          </p>
          <form action={updateSatsangAction} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={`/admin/satsangs/${id}/allocation`} />
            <fieldset className="space-y-2">
              <legend className="sr-only">Template</legend>
              {templates.length === 0 && (
                <p>
                  No templates yet.{" "}
                  <Link className="underline" href="/admin/templates">
                    Upload one
                  </Link>
                  .
                </p>
              )}
              {templates.map((t) => {
                const blocks = fillUnitCount(t.rows);
                const diff = blocks - chanters;
                const note =
                  chanters === 0 ? "" : diff < 0 ? `${-diff} on standby` : diff > 0 ? `${Math.min(diff, chanters)} chant twice` : "exact fit";
                return (
                  <label key={t.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                    <input type="radio" name="templateId" value={t.id} defaultChecked={s.templateId === t.id} className="mt-1 size-4" />
                    <span>
                      <span className="font-medium">{t.name}</span> — {t.slokamsPerBhakta} per bhakta — {blocks} blocks for {chanters} chanters
                      {note && <span className={diff < 0 ? "text-bad font-semibold" : "text-muted"}> ({note})</span>}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <div>
              <label className="label" htmlFor="title">
                Title (third header line)
              </label>
              <input id="title" name="title" className="input" defaultValue={s.title} />
            </div>
            {rowsCount ? (
              <ConfirmButton className="btn btn-quiet" message="Changing the template discards the current draft. Continue?">
                Save
              </ConfirmButton>
            ) : (
              <button className="btn btn-quiet">Save</button>
            )}
          </form>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">2. Generate and publish</h2>
          {!closed && <p className="text-warn">Close voting first (on the This week page).</p>}
          <div className="flex flex-wrap gap-2">
            <form action={generateAction}>
              <input type="hidden" name="id" value={id} />
              {rowsCount ? (
                <ConfirmButton message="Regenerate? Your manual edits will be replaced." className="btn">
                  Regenerate
                </ConfirmButton>
              ) : (
                <button className="btn" disabled={!closed || !s.templateId}>
                  Generate
                </button>
              )}
            </form>
            {rowsCount > 0 && status !== "PUBLISHED" && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value="publish" />
                <button className="btn">Publish</button>
              </form>
            )}
            {status === "PUBLISHED" && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value="unpublish" />
                <ConfirmButton className="btn btn-quiet" message="Hide the allocation from bhaktas?">
                  Unpublish
                </ConfirmButton>
              </form>
            )}
            {auto && status !== "PUBLISHED" && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value={s.publishPaused ? "resume" : "pause"} />
                <button className="btn btn-quiet">{s.publishPaused ? "Resume auto-publish" : "Pause auto-publish"}</button>
              </form>
            )}
            {rowsCount > 0 && (
              <form action={clearAllocationAction}>
                <input type="hidden" name="id" value={id} />
                <ConfirmButton className="btn btn-quiet" message="Clear the whole allocation?">
                  Clear
                </ConfirmButton>
              </form>
            )}
          </div>
          {grid && (
            <div className="flex flex-wrap gap-2 text-sm">
              <a className="btn btn-quiet btn-sm" href={`/admin/satsangs/${id}/xlsx`}>
                Download XLSX
              </a>
              {status === "PUBLISHED" && (
                <Link className="btn btn-quiet btn-sm" href="/allocation">
                  View public page
                </Link>
              )}
            </div>
          )}
          {grid && (
            <ul className="text-sm space-y-1">
              {standby.length > 0 && (
                <li className="text-bad">
                  <strong>{standby.length} on standby</strong> (no slokam): {standby.join(", ")}. Pick a template with more blocks.
                </li>
              )}
              {backupIds.size === 0 && <li className="text-warn">No one volunteered as backup — rows have no backup.</li>}
              {backupIds.size > 0 && noBackup > 0 && <li className="text-warn">{noBackup} rows have no backup.</li>}
              {standby.length === 0 && noBackup === 0 && <li className="text-ok">Every chanter has a slokam and every row has a backup.</li>}
            </ul>
          )}
        </section>
      </div>

      {grid && (
        <section className="mt-6">
          <h2 className="font-semibold mb-2">3. Review and adjust</h2>
          <p className="text-sm text-muted mb-3">
            Click &quot;change&quot; to pick a different name; it saves straight away and is logged. &quot;Covered by&quot; records who actually chanted on the day (late drop-out).
          </p>
          <AllocationEditor
            satsangId={id}
            units={units.map((u) => ({
              unitNo: u.unitNo,
              label: unitLabel(u.unitNo),
              prefilled: u.rowKind === "PREFILLED" ? u.allocated : null,
              primary: u.primaryBhaktaId,
              backup: u.backupBhaktaId,
              covered: u.coveredById,
            }))}
            people={bhaktas.map((b) => ({ id: b.id, name: b.name, chanting: chanterIds.has(b.id), backup: backupIds.has(b.id) }))}
          />

          <form action={swapUnitsAction} className="card mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={id} />
            <div>
              <label className="label text-sm" htmlFor="unitA">
                Swap row
              </label>
              <select id="unitA" name="unitA" className="input !min-h-9 text-sm">
                {units
                  .filter((u) => u.rowKind !== "PREFILLED")
                  .map((u) => (
                    <option key={u.unitNo} value={u.unitNo}>
                      {u.unitNo}. {u.allocated || "—"}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label text-sm" htmlFor="unitB">
                with row
              </label>
              <select id="unitB" name="unitB" className="input !min-h-9 text-sm">
                {units
                  .filter((u) => u.rowKind !== "PREFILLED")
                  .map((u) => (
                    <option key={u.unitNo} value={u.unitNo}>
                      {u.unitNo}. {u.allocated || "—"}
                    </option>
                  ))}
              </select>
            </div>
            <button className="btn btn-quiet">Swap</button>
          </form>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold mb-2">Change log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted">No changes yet.</p>
        ) : (
          <ul className="card text-sm space-y-1">
            {log.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="text-muted tabular-nums w-36 shrink-0">{shortIST(e.at)}</span>
                <span className="w-20 shrink-0">{e.actor === "SCHEDULER" ? "Scheduler" : "Admin"}</span>
                <span>{e.action}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
