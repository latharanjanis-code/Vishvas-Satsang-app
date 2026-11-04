// Pure part: the allocation as shown to participants: columns A–E with the template's merges (design.md §6, §8).

export type GridLine = {
  id: number;
  sheetOrder: number;
  section: string;
  fromText: string | null;
  toText: string | null;
  rowKind: "BLOCK" | "NAMED_PART" | "SINGLE_PRAYER" | "PREFILLED";
  rowSpan: number;
  unitNo: number;
  primaryBhaktaId: number | null;
  backupBhaktaId: number | null;
  coveredById: number | null;
  status: "ASSIGNED" | "DROPPED" | "COVERED";
  allocated: string; // name shown under "Allocated to" (or in the merged B–D cell for prayers)
  backup: string;
  /** Lines covered by this line's "Allocated to" cell; 0 when merged into the line above. */
  unitSpan: number;
  /** Lines covered by this line's Backup cell; 0 when merged into the line above. */
  backupSpan: number;
};

export type Grid = { headerLines: [string, string, string]; lines: GridLine[] };

type RowIn = Omit<GridLine, "allocated" | "backup" | "unitSpan" | "backupSpan"> & { prefilledName: string | null };

export function buildGrid(rows: RowIn[], names: Map<number, string>): GridLine[] {
  const sorted = [...rows].sort((a, b) => a.sheetOrder - b.sheetOrder);
  const name = (id: number | null) => (id ? (names.get(id) ?? "?") : "");
  const lines: GridLine[] = sorted.map((r) => {
    let allocated = r.prefilledName ?? name(r.primaryBhaktaId);
    if (r.coveredById && r.coveredById !== r.primaryBhaktaId) {
      allocated = `${name(r.coveredById)} (for ${name(r.primaryBhaktaId)})`;
    }
    const { prefilledName: _p, ...rest } = r;
    void _p;
    return { ...rest, allocated, backup: name(r.backupBhaktaId), unitSpan: 0, backupSpan: 0 };
  });
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1].unitNo === lines[i].unitNo) j++;
    lines[i].unitSpan = j - i + 1;
    i = j + 1;
  }
  for (let i = 0; i < lines.length; ) {
    let j = i;
    const b = lines[i].backupBhaktaId;
    if (b !== null) while (j + 1 < lines.length && lines[j + 1].backupBhaktaId === b) j++;
    lines[i].backupSpan = j - i + 1;
    i = j + 1;
  }
  return lines;
}
