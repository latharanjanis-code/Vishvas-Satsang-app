"use client";
// Allocation grid: table on wide screens, one card per unit on phones; search highlights matches (spec B7).
import { useMemo, useState } from "react";
import type { GridLine } from "@/lib/gridCore";

const range = (l: GridLine) => (l.toText ? `${l.fromText}–${l.toText}` : (l.fromText ?? ""));

export function GridView({ lines, search = true }: { lines: GridLine[]; search?: boolean }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const match = (s: string) => needle.length >= 2 && s.toLowerCase().includes(needle);

  // Lines of a unit share the unit's "Allocated to" text.
  const unitText = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of lines) if (!m.has(l.unitNo)) m.set(l.unitNo, l.allocated);
    return m;
  }, [lines]);
  const backupOfLine = useMemo(() => {
    const out: string[] = [];
    let current = "";
    lines.forEach((l, i) => {
      if (l.backupSpan > 0) current = l.backup;
      out[i] = current;
    });
    return out;
  }, [lines]);

  const units = useMemo(() => {
    const out: { unitNo: number; lines: GridLine[]; backupIdx: number }[] = [];
    lines.forEach((l, i) => {
      const last = out.at(-1);
      if (last && last.unitNo === l.unitNo) last.lines.push(l);
      else out.push({ unitNo: l.unitNo, lines: [l], backupIdx: i });
    });
    return out;
  }, [lines]);

  const hits = lines.filter((l, i) => l.unitSpan > 0 && (match(unitText.get(l.unitNo) ?? "") || match(backupOfLine[i]))).length;

  return (
    <div>
      {search && (
        <div className="no-print mb-4">
          <label htmlFor="find" className="label">
            Find your name
          </label>
          <input id="find" className="input text-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 2 letters" />
          {needle.length >= 2 && (
            <p className="text-sm text-muted mt-1" aria-live="polite">
              {hits === 0 ? "No match." : "Matches are highlighted."}
            </p>
          )}
        </div>
      )}

      {/* Wide screens and print: the sheet layout. */}
      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="sheet text-[0.95rem]">
          <thead>
            <tr>
              <th>Shlokas</th>
              <th className="text-center">From</th>
              <th className="text-center">To</th>
              <th>Allocated to</th>
              <th>Backup</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const rowHit = match(unitText.get(l.unitNo) ?? "");
              const cls = rowHit ? "hit" : "";
              return (
                <tr key={l.id}>
                  <td className={cls}>{l.section}</td>
                  {l.rowKind === "SINGLE_PRAYER" ? (
                    <td colSpan={3} className={`text-center ${cls}`}>
                      {l.allocated}
                    </td>
                  ) : (
                    <>
                      {l.toText ? (
                        <>
                          <td className={`num ${cls}`}>{l.fromText}</td>
                          <td className={`num ${cls}`}>{l.toText}</td>
                        </>
                      ) : (
                        <td colSpan={2} className={`text-center ${cls}`}>
                          {l.fromText}
                        </td>
                      )}
                      {l.unitSpan > 0 && (
                        <td rowSpan={l.unitSpan} className={`font-medium ${cls}`}>
                          {l.allocated}
                        </td>
                      )}
                    </>
                  )}
                  {l.backupSpan > 0 && (
                    <td rowSpan={l.backupSpan} className={match(backupOfLine[i]) ? "hit" : ""}>
                      {l.backup}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: same fields, same order, stacked. */}
      <ol className="sm:hidden print:hidden space-y-2">
        {units.map((u) => {
          const first = u.lines[0];
          const name = first.allocated;
          const backup = backupOfLine[u.backupIdx];
          const hit = match(name) || match(backup);
          return (
            <li key={u.unitNo} className={`card !p-3 ${hit ? "hit" : ""}`}>
              {u.lines.map((l) => (
                <p key={l.id} className="font-semibold">
                  {l.section}
                  {l.rowKind !== "SINGLE_PRAYER" && range(l) && <span className="font-normal"> · {range(l)}</span>}
                </p>
              ))}
              <p className="mt-1">
                <span className="text-muted text-sm">Allocated to </span>
                <span className="text-lg font-semibold">{name || "—"}</span>
              </p>
              {backup && (
                <p>
                  <span className="text-muted text-sm">Backup </span>
                  {backup}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
