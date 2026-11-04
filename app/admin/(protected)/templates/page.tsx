// Slokam templates (spec A6).
import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, getBatch } from "@/lib/db";
import { fillUnitCount } from "@/lib/allocation";
import { deleteTemplateAction, editTemplateAction, fixedNamesAction, setDefaultTemplateAction } from "../../template-actions";
import { ConfirmButton } from "../../client-bits";
import { Flash, PageTitle, flashFrom, type SP } from "../../ui";
import { UploadPanel } from "./upload-panel";

export default function TemplatesPage({ searchParams }: { searchParams: SP }) {
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
  const templates = await db.slokamTemplate.findMany({
    orderBy: { id: "asc" },
    include: { rows: { select: { sheetOrder: true, rowKind: true, unitNo: true } } },
  });
  const defaultId = batch.schedule?.defaultTemplateId;

  return (
    <>
      <PageTitle sub="Each template is its own ordered list of slokams. The admin picks one each week.">Templates</PageTitle>
      <Flash {...flash} />
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <section className="space-y-3">
          {templates.length === 0 && <p className="card">No templates yet. Upload one.</p>}
          {templates.map((t) => (
            <div key={t.id} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{t.name}</h2>
                {t.id === defaultId && <span className="chip">Default</span>}
              </div>
              <p className="text-sm text-muted">
                {fillUnitCount(t.rows)} blocks to fill · {t.rows.length} lines · from {t.sourceFile}
              </p>
              <form action={editTemplateAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={t.id} />
                <label className="text-sm">
                  Name
                  <input name="name" defaultValue={t.name} className="input !min-h-9" />
                </label>
                <label className="text-sm">
                  Per bhakta
                  <input name="slokamsPerBhakta" type="number" min={1} defaultValue={t.slokamsPerBhakta} className="input !min-h-9 w-20" />
                </label>
                <button className="btn btn-quiet btn-sm">Save</button>
              </form>
              <div className="flex gap-2">
                {t.id !== defaultId && (
                  <form action={setDefaultTemplateAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn btn-quiet btn-sm">Make default</button>
                  </form>
                )}
                <form action={deleteTemplateAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <ConfirmButton className="btn btn-quiet btn-sm" message={`Delete template "${t.name}"?`}>
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </section>

        <div className="space-y-4">
          <UploadPanel />
          <form action={fixedNamesAction} className="card space-y-2">
            <label htmlFor="fixedNames" className="label">
              Fixed names
            </label>
            <p className="text-sm text-muted">Names in &quot;Allocated to&quot; that stay as they are and are never given to a bhakta.</p>
            <input id="fixedNames" name="fixedNames" className="input" defaultValue={batch.fixedNames.join(", ")} />
            <button className="btn btn-quiet btn-sm">Save</button>
          </form>
        </div>
      </div>
    </>
  );
}
