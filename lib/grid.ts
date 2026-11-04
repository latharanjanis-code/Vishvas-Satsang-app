// Loads a satsang's allocation as participants see it.
import { db } from "./db";
import { sheetDateLine } from "./time";
import { buildGrid, type Grid } from "./gridCore";

export { buildGrid, type Grid, type GridLine } from "./gridCore";

export async function loadGrid(satsangId: number): Promise<Grid> {
  const s = await db.satsang.findUniqueOrThrow({ where: { id: satsangId }, include: { batch: true, rows: true } });
  const ids = new Set<number>();
  for (const r of s.rows) [r.primaryBhaktaId, r.backupBhaktaId, r.coveredById].forEach((id) => id && ids.add(id));
  const bhaktas = await db.bhakta.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } });
  const names = new Map(bhaktas.map((b) => [b.id, b.name]));
  return {
    headerLines: [s.batch.name, sheetDateLine(s.startsAt), s.title],
    lines: buildGrid(s.rows, names),
  };
}
