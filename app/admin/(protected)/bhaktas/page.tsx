// Master list of names (spec A2).
import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, getBatch } from "@/lib/db";
import { nameWarnings } from "@/lib/names";
import { addBhaktaAction, toggleBhaktaAction, updateBhaktaAction } from "../../bhakta-actions";
import { Flash, PageTitle, flashFrom, type SP } from "../../ui";
import { ImportPanel } from "./import-panel";

export default function BhaktasPage({ searchParams }: { searchParams: SP }) {
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
  const batch = await getBatch();
  const list = await db.bhakta.findMany({ where: { batchId: batch.id }, orderBy: [{ active: "desc" }, { listOrder: "asc" }] });
  const active = list.filter((b) => b.active).length;

  return (
    <>
      <PageTitle sub={`${active} active · ${list.length - active} deactivated. List order decides who chants first (it rotates each week).`}>
        Master list
      </PageTitle>
      <Flash {...flash} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr] items-start">
        <div className="space-y-4">
          <form action={addBhaktaAction} className="card space-y-2">
            <label htmlFor="new-name" className="label">
              Add a name
            </label>
            <div className="flex gap-2">
              <input id="new-name" name="name" className="input" required />
              <button className="btn">Add</button>
            </div>
            <p className="text-sm text-muted">Bhaktas must type it exactly like this (capital letters don&apos;t matter).</p>
          </form>
          <ImportPanel />
        </div>

        <section className="card !p-0 overflow-hidden">
          <table className="sheet text-sm">
            <thead>
              <tr>
                <th className="w-20">Order</th>
                <th>Name</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const warn = nameWarnings(b.name);
                return (
                  <tr key={b.id} className={b.active ? "" : "text-muted bg-bg"}>
                    <td colSpan={2}>
                      <form action={updateBhaktaAction} className="flex gap-2 items-center">
                        <input type="hidden" name="id" value={b.id} />
                        <input name="listOrder" defaultValue={b.listOrder} className="input !min-h-8 !py-0.5 w-16 tabular-nums" aria-label={`Order for ${b.name}`} />
                        <input name="name" defaultValue={b.name} className="input !min-h-8 !py-0.5" aria-label={`Name ${b.listOrder}`} />
                        <button className="btn btn-quiet btn-sm">Save</button>
                      </form>
                      {warn.length > 0 && <p className="text-xs text-warn mt-0.5">Check spelling: {warn.join(", ")}</p>}
                    </td>
                    <td>
                      <form action={toggleBhaktaAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <button className="btn btn-quiet btn-sm w-full">{b.active ? "Deactivate" : "Reactivate"}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
