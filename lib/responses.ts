import { db } from "./db";

/** Response lists for the dashboard (spec A7). */
export async function responseSummary(satsangId: number, batchId: number) {
  const [bhaktas, responses, rejected] = await Promise.all([
    db.bhakta.findMany({ where: { batchId, active: true }, orderBy: { listOrder: "asc" } }),
    db.response.findMany({ where: { satsangId }, include: { bhakta: true }, orderBy: { updatedAt: "desc" } }),
    db.rejectedAttempt.findMany({ where: { satsangId }, orderBy: { attemptedAt: "desc" } }),
  ]);
  const active = responses.filter((r) => r.bhakta.active);
  const responded = new Set(active.map((r) => r.bhaktaId));
  return {
    available: active.filter((r) => r.choice === "AVAILABLE"),
    backup: active.filter((r) => r.choice === "BACKUP"),
    notAvailable: active.filter((r) => r.choice === "NOT_AVAILABLE"),
    noResponse: bhaktas.filter((b) => !responded.has(b.id)),
    rejected,
    total: bhaktas.length,
  };
}
