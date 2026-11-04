import { describe, expect, it } from "vitest";
import { allocate, orderPool, splitEvenly, type Chanter, type TemplateLine } from "@/lib/allocation";

const blocks = (n: number): TemplateLine[] =>
  Array.from({ length: n }, (_, i) => ({ sheetOrder: i + 1, rowKind: "BLOCK", unitNo: i + 1 }));

const people = (n: number, backups: number[] = []): Chanter[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 100 + i + 1,
    listOrder: i + 1,
    choice: backups.includes(i + 1) ? "BACKUP" : "AVAILABLE",
  }));

describe("spec worked example", () => {
  // 10 rows, 10 bhaktas; Ravi (3rd) and Meena (8th) are backups.
  const res = allocate({ lines: blocks(10), pool: people(10, [3, 8]), seq: 0 });
  const RAVI = 103;
  const MEENA = 108;

  it("gives everyone one row in list order", () => {
    expect(res.lines.map((l) => l.primaryBhaktaId)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
    expect(res.standby).toEqual([]);
  });

  it("splits backups into two groups, each covering its whole group without covering their own row", () => {
    // Ravi's own row (3) is in the first half, so Meena takes rows 1–5 and Ravi rows 6–10: no hand-overs.
    const b = res.lines.map((l) => l.backupBhaktaId);
    expect(b).toEqual([MEENA, MEENA, MEENA, MEENA, MEENA, RAVI, RAVI, RAVI, RAVI, RAVI]);
  });
});

describe("prayers share one backup when backups are few", () => {
  it("one backup covers Opening Prayer, Pledge and the next rows, even if a backup chants Pledge", () => {
    const lines: TemplateLine[] = [
      { sheetOrder: 1, rowKind: "SINGLE_PRAYER", unitNo: 1 }, // Opening Prayer
      { sheetOrder: 2, rowKind: "SINGLE_PRAYER", unitNo: 2 }, // Pledge
      { sheetOrder: 3, rowKind: "PREFILLED", unitNo: 3 }, // VISVAS
      { sheetOrder: 4, rowKind: "BLOCK", unitNo: 4 },
      { sheetOrder: 5, rowKind: "BLOCK", unitNo: 5 },
      { sheetOrder: 6, rowKind: "BLOCK", unitNo: 6 },
    ];
    // Person 2 (chants Pledge) and person 4 are backups.
    const res = allocate({ lines, pool: people(5, [2, 4]), seq: 0 });
    expect(res.lines.map((l) => l.primaryBhaktaId)).toEqual([101, 102, null, 103, 104, 105]);
    expect(res.lines.map((l) => l.backupBhaktaId)).toEqual([104, 104, 104, 102, 102, 102]);
    expect(res.warnings).toEqual([]);
  });

  it("still hands over a single row when no arrangement avoids it", () => {
    // One backup who also chants a row in the only group.
    const res = allocate({ lines: blocks(3), pool: people(3, [1]), seq: 0 });
    expect(res.lines.map((l) => l.backupBhaktaId)).toEqual([null, 101, 101]);
  });
});

describe("rules", () => {
  it("wraps from the top when there are fewer bhaktas than rows (no warning)", () => {
    const res = allocate({ lines: blocks(10), pool: people(8), seq: 0 });
    expect(res.lines[8].primaryBhaktaId).toBe(101);
    expect(res.lines[9].primaryBhaktaId).toBe(102);
    expect(res.warnings.map((w) => w.code)).toEqual(["NO_BACKUPS"]);
  });

  it("puts extra bhaktas on standby when there are more bhaktas than rows", () => {
    const res = allocate({ lines: blocks(3), pool: people(5, [1]), seq: 0 });
    expect(res.standby).toEqual([104, 105]);
    expect(res.warnings.some((w) => w.code === "STANDBY")).toBe(true);
  });

  it("with one backup, their own row has no backup and is flagged", () => {
    const res = allocate({ lines: blocks(4), pool: people(4, [2]), seq: 0 });
    expect(res.lines.map((l) => l.backupBhaktaId)).toEqual([102, null, 102, 102]);
    expect(res.warnings).toContainEqual({ code: "UNCOVERED_OWN_BLOCK", unitNo: 2, bhaktaId: 102 });
  });

  it("blocks generation with no chanters", () => {
    const res = allocate({ lines: blocks(3), pool: [], seq: 0 });
    expect(res.warnings).toEqual([{ code: "NO_CHANTERS" }]);
    expect(res.lines.every((l) => l.primaryBhaktaId === null)).toBe(true);
  });

  it("rotates the start each week by the satsang number", () => {
    expect(orderPool(people(4), 1).map((p) => p.id)).toEqual([102, 103, 104, 101]);
    expect(orderPool(people(4), 5).map((p) => p.id)).toEqual([102, 103, 104, 101]);
  });

  it("is deterministic", () => {
    const input = { lines: blocks(12), pool: people(9, [2, 6]), seq: 7 };
    expect(allocate(input)).toEqual(allocate(input));
  });

  it("fills prayers in place and skips pre-filled units but gives them a backup", () => {
    const lines: TemplateLine[] = [
      { sheetOrder: 1, rowKind: "SINGLE_PRAYER", unitNo: 1 },
      { sheetOrder: 2, rowKind: "PREFILLED", unitNo: 2 },
      { sheetOrder: 3, rowKind: "BLOCK", unitNo: 3 },
      { sheetOrder: 4, rowKind: "NAMED_PART", unitNo: 3 }, // same "Allocated to" cell
      { sheetOrder: 5, rowKind: "SINGLE_PRAYER", unitNo: 4 },
    ];
    const res = allocate({ lines, pool: people(3, [3]), seq: 0 });
    expect(res.lines.map((l) => l.primaryBhaktaId)).toEqual([101, null, 102, 102, 103]);
    expect(res.lines[1].backupBhaktaId).toBe(103);
  });

  it("splits evenly with the first groups one larger", () => {
    expect(splitEvenly(7, 3)).toEqual([0, 0, 0, 1, 1, 2, 2]);
  });
});
