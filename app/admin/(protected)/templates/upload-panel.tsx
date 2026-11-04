"use client";
// Upload a template workbook, preview each sheet, correct row kinds, save (design.md §6).
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewTemplateAction, saveTemplatesAction, type SheetPreview } from "../../template-actions";

const KIND_LABEL = { BLOCK: "Block", NAMED_PART: "Named part", SINGLE_PRAYER: "Prayer", PREFILLED: "Pre-filled" } as const;
type Kind = keyof typeof KIND_LABEL;
type SheetState = { sheet: Extract<SheetPreview, { ok: true }>; include: boolean; name: string; per: number; kinds: Record<number, Kind>; open: boolean };

export function UploadPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetState[] | null>(null);
  const [bad, setBad] = useState<{ sheetName: string; error: string }[]>([]);

  function onPreview(fd: FormData) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await previewTemplateAction(fd);
      if (!res.ok) {
        setError(res.error);
        setSheets(null);
        return;
      }
      const good = res.sheets.filter((s): s is Extract<SheetPreview, { ok: true }> => s.ok);
      setBad(res.sheets.filter((s): s is Extract<SheetPreview, { ok: false }> => !s.ok));
      setSheets(good.map((s, i) => ({ sheet: s, include: i === 0, name: s.sheetName, per: 4, kinds: {}, open: i === 0 })));
    });
  }

  function onSave() {
    const file = fileRef.current?.files?.[0];
    if (!file || !sheets) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set(
      "config",
      JSON.stringify(
        sheets.filter((s) => s.include).map((s) => ({ sheetName: s.sheet.sheetName, name: s.name, slokamsPerBhakta: s.per, kinds: s.kinds })),
      ),
    );
    start(async () => {
      const res = await saveTemplatesAction(fd);
      if (res.ok) {
        setDone(res.message);
        setSheets(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else setError(res.error);
    });
  }

  const update = (i: number, patch: Partial<SheetState>) => setSheets((ss) => ss!.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Upload a template</h2>
      <p className="text-sm text-muted">
        An .xlsx in the allocation-sheet layout (columns A–E, headings on row 4). Last week&apos;s filled-in sheet is fine: names are dropped and fixed
        names like VISVAS are kept. Each sheet can become its own template.
      </p>
      <form action={onPreview} className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" name="file" accept=".xlsx" className="text-sm" required />
        <button className="btn btn-quiet btn-sm" disabled={pending}>
          {pending && !sheets ? "Reading…" : "Preview"}
        </button>
      </form>
      {error && <p className="rounded-lg bg-bad-soft text-bad px-3 py-2">{error}</p>}
      {done && <p className="rounded-lg bg-ok-soft text-ok px-3 py-2">{done}</p>}
      {bad.length > 0 && (
        <ul className="text-sm text-warn">
          {bad.map((b) => (
            <li key={b.sheetName}>
              Sheet &quot;{b.sheetName}&quot; skipped: {b.error}
            </li>
          ))}
        </ul>
      )}

      {sheets && (
        <div className="space-y-3">
          {sheets.map((s, i) => (
            <div key={s.sheet.sheetName} className="rounded-lg border border-line p-3 space-y-2">
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={s.include} onChange={(e) => update(i, { include: e.target.checked })} />
                Sheet &quot;{s.sheet.sheetName}&quot; — {s.sheet.lines.length} lines, {s.sheet.fillUnits} blocks to fill
                {s.sheet.wasFilled && <span className="chip">past allocation — names dropped</span>}
              </label>
              {s.include && (
                <div className="flex flex-wrap gap-3">
                  <label className="text-sm">
                    Template name
                    <input className="input !min-h-9" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
                  </label>
                  <label className="text-sm">
                    Slokams per bhakta
                    <input
                      type="number"
                      min={1}
                      className="input !min-h-9 w-24"
                      value={s.per}
                      onChange={(e) => update(i, { per: Number(e.target.value) })}
                    />
                  </label>
                </div>
              )}
              <button type="button" className="text-sm underline" onClick={() => update(i, { open: !s.open })}>
                {s.open ? "Hide" : "Show"} detected rows
              </button>
              {s.open && (
                <div className="max-h-96 overflow-auto">
                  <table className="sheet text-xs">
                    <thead>
                      <tr>
                        <th>Block</th>
                        <th>Shlokas</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Kind</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.sheet.lines.map((l) => (
                        <tr key={l.sheetOrder}>
                          <td className="tabular-nums">{l.unitNo}</td>
                          <td>{l.section}</td>
                          <td>{l.fromText ?? ""}</td>
                          <td>{l.toText ?? ""}</td>
                          <td>
                            <select
                              className="border border-line rounded px-1"
                              value={s.kinds[l.sheetOrder] ?? l.rowKind}
                              onChange={(e) => update(i, { kinds: { ...s.kinds, [l.sheetOrder]: e.target.value as Kind } })}
                            >
                              {Object.entries(KIND_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                  {l.prefilledName && k === "PREFILLED" ? ` (${l.prefilledName})` : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-muted mt-1">Rows with the same block number share one &quot;Allocated to&quot; cell and go to one bhakta.</p>
                </div>
              )}
            </div>
          ))}
          <button className="btn" onClick={onSave} disabled={pending || !sheets.some((s) => s.include)}>
            {pending ? "Saving…" : "Save ticked sheets as templates"}
          </button>
        </div>
      )}
    </section>
  );
}
