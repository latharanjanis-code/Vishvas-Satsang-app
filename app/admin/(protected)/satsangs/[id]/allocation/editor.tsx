"use client";
// Allocation review table (spec A9, A12). Names show as text; a picker opens only for the cell being changed,
// so the page stays light even with 50+ rows and 75+ names.
import { useState, useTransition } from "react";
import { editUnitAction } from "../../../../satsang-actions";

export type EditorUnit = {
  unitNo: number;
  label: string;
  prefilled: string | null;
  primary: number | null;
  backup: number | null;
  covered: number | null;
};
export type Person = { id: number; name: string; chanting: boolean; backup: boolean };
type Field = "primary" | "backup" | "covered";

export function AllocationEditor({ satsangId, units, people }: { satsangId: number; units: EditorUnit[]; people: Person[] }) {
  const [editing, setEditing] = useState<{ unitNo: number; field: Field } | null>(null);
  const [pending, start] = useTransition();
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  function save(unitNo: number, field: Field, value: string) {
    const fd = new FormData();
    fd.set("id", String(satsangId));
    fd.set("unitNo", String(unitNo));
    fd.set("field", field);
    fd.set("bhaktaId", value);
    setEditing(null);
    start(() => editUnitAction(fd));
  }

  function Cell({ u, field }: { u: EditorUnit; field: Field }) {
    const current = u[field];
    if (editing?.unitNo === u.unitNo && editing.field === field) {
      return (
        <select
          autoFocus
          defaultValue={String(current ?? "")}
          className="input !min-h-9 !py-1 text-sm"
          aria-label={`${field} for row ${u.unitNo}`}
          onChange={(e) => save(u.unitNo, field, e.target.value)}
          onBlur={() => setEditing(null)}
        >
          <option value="">— none —</option>
          <optgroup label="Chanting this week">
            {people
              .filter((p) => p.chanting)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.backup ? " (backup)" : ""}
                </option>
              ))}
          </optgroup>
          <optgroup label="Everyone else">
            {people
              .filter((p) => !p.chanting)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </optgroup>
        </select>
      );
    }
    return (
      <span className="flex items-center justify-between gap-2">
        <span className={current ? "" : "text-muted"}>{current ? (nameOf.get(current) ?? "(removed)") : "—"}</span>
        <button
          type="button"
          className="text-xs underline text-accent shrink-0"
          disabled={pending}
          onClick={() => setEditing({ unitNo: u.unitNo, field })}
        >
          change
        </button>
      </span>
    );
  }

  return (
    <div className={`overflow-x-auto ${pending ? "opacity-60" : ""}`}>
      <table className="sheet text-sm">
        <thead>
          <tr>
            <th>#</th>
            <th>Slokams</th>
            <th className="min-w-48">Allocated to</th>
            <th className="min-w-48">Backup</th>
            <th className="min-w-48">Covered by (on the day)</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.unitNo} className={u.covered ? "bg-warn-soft" : ""}>
              <td className="text-muted tabular-nums">{u.unitNo}</td>
              <td>{u.label}</td>
              <td>{u.prefilled ? <strong>{u.prefilled}</strong> : <Cell u={u} field="primary" />}</td>
              <td>
                <Cell u={u} field="backup" />
              </td>
              <td>{u.prefilled ? null : <Cell u={u} field="covered" />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
