import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { listSheets, parseTemplate } from "@/lib/templates";

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "fixtures", name)));
const fixed = ["VISVAS"];

describe("short-block template (A2322-Allocation.xlsx)", async () => {
  const t = await parseTemplate(fixture("A2322-Allocation.xlsx"), { fixedNames: fixed });

  it("lists both sheets", async () => {
    expect(await listSheets(fixture("A2322-Allocation.xlsx"))).toEqual(["Satsang Chart", "Trail Satsang-2"]);
  });

  it("reads 54 lines and 53 units to fill", () => {
    expect(t.lines).toHaveLength(54);
    expect(t.fillUnits).toBe(53);
    expect(t.wasFilled).toBe(true);
  });

  it("detects row kinds", () => {
    const kinds = t.lines.map((l) => l.rowKind);
    expect(kinds.filter((k) => k === "SINGLE_PRAYER")).toHaveLength(3);
    expect(kinds.filter((k) => k === "PREFILLED")).toHaveLength(1);
    expect(kinds.filter((k) => k === "NAMED_PART")).toHaveLength(1);
    expect(kinds.filter((k) => k === "BLOCK")).toHaveLength(49);
    const visvas = t.lines.find((l) => l.rowKind === "PREFILLED")!;
    expect([visvas.section, visvas.fromText, visvas.toText, visvas.prefilledName]).toEqual(["Poorvangam", "1", "5", "VISVAS"]);
    expect(t.lines[0]).toMatchObject({ section: "Opening Prayer", fromText: null });
    expect(t.lines.at(-1)).toMatchObject({ section: "Closing Prayer" });
  });

  it("ignores the helper columns and keeps header lines", () => {
    expect(t.headerLines[0]).toBe("A2322/2874 Tamil Batch (7:30PM)");
  });
});

describe("long-block template (satsang-12-allocation-list.xlsx)", async () => {
  const t = await parseTemplate(fixture("satsang-12-allocation-list.xlsx"), { fixedNames: fixed });

  it("reads 31 lines and 28 units to fill", () => {
    expect(t.lines).toHaveLength(31);
    expect(t.fillUnits).toBe(28);
  });

  it("treats one Allocated-to cell covering two lines as one unit", () => {
    const p19 = t.lines.find((l) => l.section === "Poorvangam" && l.fromText === "19")!;
    const pny = t.lines.find((l) => l.fromText === "Poorvanyasam")!;
    expect(p19.unitNo).toBe(pny.unitNo);
    const d6 = t.lines.find((l) => l.section === "Dhyanam" && l.fromText === "6")!;
    const v1 = t.lines.find((l) => l.section === "VSN-Mahamantra" && l.fromText === "1")!;
    expect(d6.unitNo).toBe(v1.unitNo);
  });

  it("records lines spanning two sheet rows", () => {
    const p6 = t.lines.find((l) => l.section === "Poorvangam" && l.fromText === "6")!;
    expect(p6).toMatchObject({ toText: "12", rowSpan: 2 });
  });
});
