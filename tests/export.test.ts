import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTemplate } from "@/lib/templates";
import { allocate } from "@/lib/allocation";
import { buildGrid } from "@/lib/gridCore";
import { gridToXlsx } from "@/lib/export";

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "fixtures", name)));

// Template → allocation → XLSX → read back as a template: the layout must survive.
describe.each(["A2322-Allocation.xlsx", "satsang-12-allocation-list.xlsx"])("export round trip (%s)", (file) => {
  it("keeps lines, kinds, units and the 3 header lines", async () => {
    const t = await parseTemplate(fixture(file), { fixedNames: ["VISVAS"] });
    const pool = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, listOrder: i + 1, choice: (i % 5 === 0 ? "BACKUP" : "AVAILABLE") as "BACKUP" | "AVAILABLE" }));
    const res = allocate({ lines: t.lines, pool, seq: 3 });
    const byOrder = new Map(res.lines.map((l) => [l.sheetOrder, l]));
    const names = new Map(pool.map((p) => [p.id, `Person ${p.id}`]));
    const rows = t.lines.map((l, i) => ({
      id: i + 1,
      sheetOrder: l.sheetOrder,
      section: l.section,
      fromText: l.fromText,
      toText: l.toText,
      rowKind: l.rowKind,
      rowSpan: l.rowSpan,
      unitNo: l.unitNo,
      prefilledName: l.prefilledName,
      primaryBhaktaId: byOrder.get(l.sheetOrder)!.primaryBhaktaId,
      backupBhaktaId: byOrder.get(l.sheetOrder)!.backupBhaktaId,
      coveredById: null,
      status: "ASSIGNED" as const,
    }));
    const lines = buildGrid(rows, names);
    const bytes = await gridToXlsx({ headerLines: ["Batch", "Saturday, 7th Nov 2026, 7:00PM(IST)", "Satsang-1"], lines });

    const back = await parseTemplate(bytes, { fixedNames: ["VISVAS"] });
    expect(back.headerLines).toEqual(["Batch", "Saturday, 7th Nov 2026, 7:00PM(IST)", "Satsang-1"]);
    expect(back.wasFilled).toBe(true);
    expect(back.fillUnits).toBe(t.fillUnits);
    expect(back.lines.map((l) => [l.section, l.fromText, l.toText, l.rowKind, l.unitNo, l.rowSpan])).toEqual(
      t.lines.map((l) => [l.section, l.fromText, l.toText, l.rowKind, l.unitNo, l.rowSpan]),
    );
  });
});
