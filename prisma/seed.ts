// Sets up the admin account, the batch and its weekly schedule. Safe to run more than once.
// SEED_DEMO=1 also loads the sample master list and both A2322 templates from tests/fixtures.
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { parseTemplate } from "../lib/templates";
import { saveTemplate } from "../lib/templateStore";
import { previewMasterList } from "../lib/masterList";
import { normaliseName } from "../lib/names";

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!username || !password) throw new Error("Set ADMIN_USERNAME and ADMIN_INITIAL_PASSWORD in .env");

  if (!(await db.adminAccount.findUnique({ where: { id: 1 } }))) {
    await db.adminAccount.create({
      data: { id: 1, username, passwordHash: await hashPassword(password), mustChangePassword: true },
    });
    console.log(`Admin "${username}" created (must change password at first login).`);
  }

  let batch = await db.batch.findFirst({ orderBy: { id: "asc" } });
  if (!batch) {
    batch = await db.batch.create({ data: { name: "A2322/2874 Tamil Batch (7:30PM)" } });
    console.log(`Batch "${batch.name}" created.`);
  }
  if (!(await db.weeklySchedule.findUnique({ where: { batchId: batch.id } }))) {
    await db.weeklySchedule.create({ data: { batchId: batch.id } });
    console.log("Weekly schedule created: Sat 7:00 pm, open Mon 6:00 am, close Tue 11:59 pm, publish Wed 6:00 am (IST).");
  }

  if (process.env.SEED_DEMO === "1") {
    const fx = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "..", "tests", "fixtures", f)));

    if ((await db.bhakta.count()) === 0) {
      const preview = await previewMasterList("master-list-names.csv", fx("master-list-names.csv"));
      await db.bhakta.createMany({
        data: preview.rows.map((r, i) => ({ batchId: batch.id, name: r.name, nameKey: normaliseName(r.name), listOrder: i + 1 })),
      });
      console.log(`Demo: ${preview.rows.length} names imported.`);
    }
    if ((await db.slokamTemplate.count()) === 0) {
      const short = await parseTemplate(fx("A2322-Allocation.xlsx"), { fixedNames: batch.fixedNames });
      const t1 = await saveTemplate({ name: "Short blocks", slokamsPerBhakta: 4, sourceFile: "A2322-Allocation.xlsx / Satsang Chart", parsed: short });
      const long = await parseTemplate(fx("satsang-12-allocation-list.xlsx"), { fixedNames: batch.fixedNames });
      await saveTemplate({ name: "Long blocks", slokamsPerBhakta: 7, sourceFile: "satsang 12 allocation list.xlsx / Satsang Chart", parsed: long });
      await db.weeklySchedule.update({ where: { batchId: batch.id }, data: { defaultTemplateId: t1.id } });
      console.log("Demo: templates 'Short blocks' (default) and 'Long blocks' saved.");
    }
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
