"use client";
// Master-list import with preview (design.md §6). Only column A is read.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitImportAction, previewImportAction, type ImportPreviewResult } from "../../bhakta-actions";

const WARN_TEXT: Record<string, string> = {
  email: "looks like an email",
  digits: "contains digits",
  "all-lower": "all lowercase",
  "all-caps": "ALL CAPS",
};

type Row = Extract<ImportPreviewResult, { ok: true }>["rows"][number] & { include: boolean; edited: string };

export function ImportPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [extra, setExtra] = useState<{ blankRows: number[]; merged: { name: string; rows: number[] }[] }>({ blankRows: [], merged: [] });

  function onPreview(fd: FormData) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await previewImportAction(fd);
      if (!res.ok) {
        setError(res.error);
        setRows(null);
        return;
      }
      setRows(res.rows.map((r) => ({ ...r, include: r.existing !== "active", edited: r.name })));
      setExtra({ blankRows: res.blankRows, merged: res.mergedInFile });
    });
  }

  function onImport() {
    if (!rows) return;
    start(async () => {
      const names = rows.filter((r) => r.include).map((r) => r.edited);
      const res = await commitImportAction(JSON.stringify(names));
      if (res.ok) {
        setDone(res.message);
        setRows(null);
        router.refresh();
      } else setError(res.message);
    });
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Import from a file</h2>
      <p className="text-sm text-muted">
        .xlsx or .csv. <strong>Only column A is read</strong> — phone numbers and other columns are ignored and never stored. A first row that is blank
        or says &quot;Name&quot; is skipped.
      </p>
      <form action={onPreview} className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".xlsx,.csv" className="text-sm" required />
        <button className="btn btn-quiet btn-sm" disabled={pending}>
          {pending && !rows ? "Reading…" : "Preview"}
        </button>
      </form>
      {error && <p className="rounded-lg bg-bad-soft text-bad px-3 py-2">{error}</p>}
      {done && <p className="rounded-lg bg-ok-soft text-ok px-3 py-2">{done}</p>}

      {rows && (
        <div className="space-y-3">
          <ul className="text-sm space-y-1">
            <li>
              {rows.length} names found · {rows.filter((r) => r.existing === "new").length} new ·{" "}
              {rows.filter((r) => r.existing === "active").length} already on the list · {rows.filter((r) => r.existing === "inactive").length} to
              reactivate
            </li>
            {extra.blankRows.length > 0 && (
              <li className="text-warn">
                Column A is blank on row{extra.blankRows.length > 1 ? "s" : ""} {extra.blankRows.join(", ")} — fill it in the file or add those names
                by hand.
              </li>
            )}
            {extra.merged.length > 0 && (
              <li>Duplicates merged: {extra.merged.map((m) => `${m.name} (rows ${m.rows.join(", ")})`).join("; ")}</li>
            )}
          </ul>
          <div className="max-h-[28rem] overflow-auto border border-line rounded-lg">
            <table className="sheet text-sm">
              <thead>
                <tr>
                  <th>Import</th>
                  <th>Row</th>
                  <th>Name (editable)</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.row} className={r.warnings.length ? "bg-warn-soft" : ""}>
                    <td className="text-center">
                      <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Import row ${r.row}`} />
                    </td>
                    <td className="tabular-nums">{r.row}</td>
                    <td>
                      <input className="input !min-h-8 !py-0.5" value={r.edited} onChange={(e) => update(i, { edited: e.target.value })} />
                    </td>
                    <td className="text-xs">
                      {[
                        r.existing === "active" ? "already on list" : r.existing === "inactive" ? "will be reactivated" : "",
                        ...r.warnings.map((w) => WARN_TEXT[w]),
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" onClick={onImport} disabled={pending}>
            {pending ? "Importing…" : `Import ${rows.filter((r) => r.include).length} names`}
          </button>
        </div>
      )}
    </section>
  );
}
