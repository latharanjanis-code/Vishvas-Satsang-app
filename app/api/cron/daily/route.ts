// Daily backstop (design.md §4). Vercel Cron calls this once a day with the CRON_SECRET.
import { connection } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createNextSatsang, currentSatsang, ensureUpToDate } from "@/lib/satsangs";

export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const report: string[] = [];

  // 1. Mark finished satsangs completed.
  const done = await db.satsang.updateMany({
    where: { status: { not: "COMPLETED" }, startsAt: { lt: new Date(now.getTime() - 3 * 60 * 60 * 1000) } },
    data: { status: "COMPLETED" },
  });
  if (done.count) report.push(`${done.count} marked completed`);

  const batches = await db.batch.findMany({ where: { active: true }, include: { schedule: true } });
  for (const batch of batches) {
    // 2. Auto mode: make sure next week's satsang exists.
    let s = await currentSatsang(batch.id, now);
    if (!s && batch.schedule?.autoMode) {
      const created = await createNextSatsang(batch.id, "SCHEDULER", now);
      report.push(`created ${created.title}`);
      s = await currentSatsang(batch.id, now);
    }
    // 3. Catch up any step the clock says is due (covers weeks with no visitors).
    if (s) await ensureUpToDate(s.id, now);
  }

  // 4. Housekeeping: old rate-limit counters and audit entries older than 12 months.
  await db.rateLimitHit.deleteMany({ where: { windowEnd: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  await db.auditLog.deleteMany({ where: { at: { lt: yearAgo } } });

  await audit(db, { actor: "SCHEDULER", action: "daily-backstop", after: { report } });
  return Response.json({ ok: true, report });
}
