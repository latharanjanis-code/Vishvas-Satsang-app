// Allocation engine (design.md §5, spec "Allocation logic").
// Pure: no database, no clock, no randomness. Same input → same output.

export type RowKind = "BLOCK" | "NAMED_PART" | "SINGLE_PRAYER" | "PREFILLED";

export type TemplateLine = {
  sheetOrder: number;
  rowKind: RowKind;
  unitNo: number;
};

export type Chanter = {
  id: number;
  listOrder: number;
  choice: "AVAILABLE" | "BACKUP";
};

export type LineAssignment = {
  sheetOrder: number;
  unitNo: number;
  primaryBhaktaId: number | null;
  backupBhaktaId: number | null;
  backupGroup: number | null;
};

export type Warning =
  | { code: "NO_CHANTERS" }
  | { code: "NO_BACKUPS" }
  | { code: "STANDBY"; bhaktaIds: number[] }
  | { code: "UNCOVERED_OWN_BLOCK"; unitNo: number; bhaktaId: number };

export type AllocationResult = {
  lines: LineAssignment[];
  standby: number[];
  warnings: Warning[];
};

type Unit = { unitNo: number; prefilled: boolean; lines: TemplateLine[] };

/** Group lines into fill units, in sheet order. */
export function toUnits(lines: TemplateLine[]): Unit[] {
  const sorted = [...lines].sort((a, b) => a.sheetOrder - b.sheetOrder);
  const byNo = new Map<number, Unit>();
  const units: Unit[] = [];
  for (const line of sorted) {
    let u = byNo.get(line.unitNo);
    if (!u) {
      u = { unitNo: line.unitNo, prefilled: true, lines: [] };
      byNo.set(line.unitNo, u);
      units.push(u);
    }
    u.lines.push(line);
    if (line.rowKind !== "PREFILLED") u.prefilled = false;
  }
  return units;
}

/** Number of units a bhakta can be given (the "block count" in the template picker). */
export function fillUnitCount(lines: TemplateLine[]): number {
  return toUnits(lines).filter((u) => !u.prefilled).length;
}

/** Chanters in master-list order, rotated by the satsang's sequence number. */
export function orderPool(pool: Chanter[], seq: number): Chanter[] {
  const sorted = [...pool].sort((a, b) => a.listOrder - b.listOrder || a.id - b.id);
  if (sorted.length === 0) return sorted;
  const offset = ((seq % sorted.length) + sorted.length) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

/** Split n items into k contiguous groups as evenly as possible; returns group index per item. */
export function splitEvenly(n: number, k: number): number[] {
  const out: number[] = [];
  const base = Math.floor(n / k);
  const extra = n % k;
  for (let g = 0; g < k; g++) {
    const size = base + (g < extra ? 1 : 0);
    for (let i = 0; i < size; i++) out.push(g);
  }
  return out;
}

export function allocate(input: { lines: TemplateLine[]; pool: Chanter[]; seq: number }): AllocationResult {
  const units = toUnits(input.lines);
  const pool = orderPool(input.pool, input.seq);
  const warnings: Warning[] = [];

  if (pool.length === 0) {
    return {
      lines: units.flatMap((u) =>
        u.lines.map((l) => ({ sheetOrder: l.sheetOrder, unitNo: u.unitNo, primaryBhaktaId: null, backupBhaktaId: null, backupGroup: null })),
      ),
      standby: [],
      warnings: [{ code: "NO_CHANTERS" }],
    };
  }

  // Steps 2–5: fill units top to bottom (prayers in place), wrapping when people run out.
  const primary = new Map<number, number>();
  const fillUnits = units.filter((u) => !u.prefilled);
  fillUnits.forEach((u, i) => primary.set(u.unitNo, pool[i % pool.length].id));

  // Step 6: more people than units → standby.
  const standby = pool.length > fillUnits.length ? pool.slice(fillUnits.length).map((c) => c.id) : [];
  if (standby.length > 0) warnings.push({ code: "STANDBY", bhaktaIds: standby });

  // Steps 7–9: backups cover contiguous groups of all units (VISVAS included).
  const backups = pool.filter((c) => c.choice === "BACKUP").map((c) => c.id);
  const backupOf = new Map<number, { id: number | null; group: number }>();
  if (backups.length === 0) {
    warnings.push({ code: "NO_BACKUPS" });
  } else {
    const k = backups.length;
    const groups = splitEvenly(units.length, Math.min(k, units.length));
    // Choose which backup takes which group so that, where possible, nobody's group holds their own slokam.
    // Then one backup covers a whole run (e.g. Opening Prayer + Pledge + early Poorvangam) without a hand-over.
    // Rotations are tried in order; the first with the fewest clashes wins (deterministic).
    const clashes = (r: number) =>
      units.filter((u, i) => primary.get(u.unitNo) === backups[(groups[i] + r) % k]).length;
    let best = 0;
    for (let r = 1; r < k && clashes(best) > 0; r++) if (clashes(r) < clashes(best)) best = r;
    const backupForGroup = (g: number) => backups[(g + best) % k];

    units.forEach((u, i) => {
      const g = groups[i];
      const own = backupForGroup(g);
      const p = primary.get(u.unitNo) ?? null;
      if (p !== own) {
        backupOf.set(u.unitNo, { id: own, group: g });
      } else if (k > 1) {
        backupOf.set(u.unitNo, { id: backupForGroup(g + 1), group: g });
      } else {
        backupOf.set(u.unitNo, { id: null, group: g });
        warnings.push({ code: "UNCOVERED_OWN_BLOCK", unitNo: u.unitNo, bhaktaId: own });
      }
    });
  }

  const lines: LineAssignment[] = units.flatMap((u) =>
    u.lines.map((l) => ({
      sheetOrder: l.sheetOrder,
      unitNo: u.unitNo,
      primaryBhaktaId: primary.get(u.unitNo) ?? null,
      backupBhaktaId: backupOf.get(u.unitNo)?.id ?? null,
      backupGroup: backupOf.get(u.unitNo)?.group ?? null,
    })),
  );
  return { lines, standby, warnings };
}
