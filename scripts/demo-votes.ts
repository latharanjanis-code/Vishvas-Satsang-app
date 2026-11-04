// Dev helper: adds demo votes to the current satsang (local testing only).
import "dotenv/config";
import { db, getBatch } from "../lib/db";
import { currentSatsang } from "../lib/satsangs";

async function main() {
  const batch = await getBatch();
  const s = await currentSatsang(batch.id);
  if (!s) throw new Error("No current satsang");
  const bhaktas = await db.bhakta.findMany({ where: { batchId: batch.id, active: true }, orderBy: { listOrder: "asc" } });
  let n = 0;
  for (const [i, b] of bhaktas.entries()) {
    if (i % 3 !== 0) continue; // every third person answers
    const choice = n % 5 === 4 ? "BACKUP" : n % 7 === 6 ? "NOT_AVAILABLE" : "AVAILABLE";
    await db.response.upsert({
      where: { satsangId_bhaktaId: { satsangId: s.id, bhaktaId: b.id } },
      create: { satsangId: s.id, bhaktaId: b.id, choice },
      update: {},
    });
    n++;
  }
  console.log(`${n} demo responses added to ${s.title}`);
}
main().finally(() => db.$disconnect());
