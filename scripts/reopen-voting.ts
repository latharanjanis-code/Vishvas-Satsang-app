// Dev helper: put the current satsang back to "voting open" (clears its allocation, keeps votes). Local testing only.
import "dotenv/config";
import { db, getBatch } from "../lib/db";
import { currentSatsang } from "../lib/satsangs";
import { audit } from "../lib/audit";

async function main() {
  const batch = await getBatch();
  const s = await currentSatsang(batch.id);
  if (!s) throw new Error("No current satsang");
  await db.allocationRow.deleteMany({ where: { satsangId: s.id } });
  await db.satsang.update({ where: { id: s.id }, data: { status: "OPEN", publishedAt: null, stateOverride: null } });
  await audit(db, { satsangId: s.id, actor: "ADMIN", action: "dev-reopen-voting" });
  console.log(`${s.title} is open for voting again.`);
}
main().finally(() => db.$disconnect());
