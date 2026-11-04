// Weekly lifecycle and allocation generation (design.md §4–§5).
import { db } from "./db";
import { audit } from "./audit";
import { allocate, type Warning } from "./allocation";
import { nextSatsangTimes } from "./time";
import type { Satsang, SatsangStatus } from "./generated/prisma/client";

const COMPLETE_AFTER_MS = 3 * 60 * 60 * 1000;

/** State shown to people, worked out from the stored status, overrides and (in auto mode) the clock. */
export function effectiveStatus(s: Satsang, autoMode: boolean, now: Date): SatsangStatus {
  if (s.status === "COMPLETED" || now.getTime() >= s.startsAt.getTime() + COMPLETE_AFTER_MS) return "COMPLETED";
  if (s.status === "PUBLISHED") return "PUBLISHED";
  if (s.stateOverride === "open") return "OPEN";
  if (s.stateOverride === "closed") return s.status === "ALLOCATED" ? "ALLOCATED" : "CLOSED";
  if (!autoMode) return s.status;
  if (now < s.opensAt) return "SCHEDULED";
  if (now < s.closesAt) return "OPEN";
  if (s.status === "ALLOCATED") return now >= s.publishAt && !s.publishPaused ? "PUBLISHED" : "ALLOCATED";
  return "CLOSED";
}

/** Which step the clock says should have happened, for the red "overdue" hint in v1. */
export function overdueStep(s: Satsang, status: SatsangStatus, now: Date): "open" | "close" | "publish" | null {
  if (status === "SCHEDULED" && now >= s.opensAt && now < s.closesAt) return "open";
  if (status === "OPEN" && now >= s.closesAt) return "close";
  if ((status === "CLOSED" || status === "ALLOCATED") && now >= s.publishAt) return "publish";
  return null;
}

/** The satsang people should see now: the next one not yet finished. */
export async function currentSatsang(batchId: number, now = new Date()) {
  return db.satsang.findFirst({
    where: { batchId, startsAt: { gt: new Date(now.getTime() - COMPLETE_AFTER_MS) } },
    orderBy: { startsAt: "asc" },
    include: { template: true },
  });
}

export async function createNextSatsang(batchId: number, actor: "ADMIN" | "SCHEDULER", now = new Date()) {
  const batch = await db.batch.findUniqueOrThrow({ where: { id: batchId }, include: { schedule: true } });
  const schedule = batch.schedule;
  if (!schedule) throw new Error("Weekly schedule missing");
  const latest = await db.satsang.findFirst({ where: { batchId }, orderBy: { startsAt: "desc" } });
  const after = latest && latest.startsAt > now ? latest.startsAt : now;
  const t = nextSatsangTimes(schedule, after);
  const seq = (latest?.seq ?? 0) + 1;
  const satsang = await db.satsang.create({
    data: {
      batchId,
      seq,
      title: `Satsang-${seq}`,
      ...t,
      templateId: schedule.defaultTemplateId,
      status: "SCHEDULED",
    },
  });
  await audit(db, { satsangId: satsang.id, actor, action: "create", after: { seq, startsAt: t.startsAt } });
  return satsang;
}

export type GenerateResult =
  | { ok: true; warnings: Warning[]; standby: number[] }
  | { ok: false; error: "NO_TEMPLATE" | "NO_CHANTERS" | "NOT_CLOSED" };

export async function generateAllocation(
  satsangId: number,
  actor: "ADMIN" | "SCHEDULER",
  opts: { onlyIfMissing?: boolean } = {},
): Promise<GenerateResult | null> {
  return db.$transaction(
    async (tx) => {
      // Stops two visitors generating at the same moment (design.md §4).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${satsangId})`;
      if (opts.onlyIfMissing && (await tx.allocationRow.count({ where: { satsangId } })) > 0) return null;

      const s = await tx.satsang.findUniqueOrThrow({
        where: { id: satsangId },
        include: { template: { include: { rows: { orderBy: { sheetOrder: "asc" } } } } },
      });
      if (s.status === "OPEN" || s.status === "SCHEDULED") {
        if (actor === "ADMIN") return { ok: false, error: "NOT_CLOSED" } as const;
      }
      if (!s.template) return { ok: false, error: "NO_TEMPLATE" } as const;

      const responses = await tx.response.findMany({
        where: { satsangId, choice: { in: ["AVAILABLE", "BACKUP"] }, bhakta: { active: true } },
        include: { bhakta: true },
      });
      const pool = responses.map((r) => ({
        id: r.bhaktaId,
        listOrder: r.bhakta.listOrder,
        choice: r.choice as "AVAILABLE" | "BACKUP",
      }));
      const res = allocate({ lines: s.template.rows, pool, seq: s.seq });
      if (res.warnings.some((w) => w.code === "NO_CHANTERS")) {
        if (actor === "SCHEDULER") {
          await tx.satsang.update({ where: { id: satsangId }, data: { publishPaused: true, holdReason: "No available bhaktas" } });
        }
        return { ok: false, error: "NO_CHANTERS" } as const;
      }

      const byOrder = new Map(res.lines.map((l) => [l.sheetOrder, l]));
      await tx.allocationRow.deleteMany({ where: { satsangId } });
      await tx.allocationRow.createMany({
        data: s.template.rows.map((row) => {
          const a = byOrder.get(row.sheetOrder)!;
          return {
            satsangId,
            sheetOrder: row.sheetOrder,
            section: row.section,
            fromText: row.fromText,
            toText: row.toText,
            rowKind: row.rowKind,
            unitNo: row.unitNo,
            rowSpan: row.rowSpan,
            prefilledName: row.prefilledName,
            backupGroup: a.backupGroup,
            primaryBhaktaId: a.primaryBhaktaId,
            backupBhaktaId: a.backupBhaktaId,
          };
        }),
      });

      const hold = actor === "SCHEDULER" && res.standby.length > 0;
      await tx.satsang.update({
        where: { id: satsangId },
        data: {
          status: s.status === "PUBLISHED" ? "PUBLISHED" : "ALLOCATED",
          ...(hold
            ? { publishPaused: true, holdReason: `${res.standby.length} bhaktas have no slokam — choose a template with more blocks` }
            : {}),
        },
      });
      await audit(tx, {
        satsangId,
        actor,
        action: "generate",
        after: { templateId: s.template.id, chanters: pool.length, standby: res.standby.length, warnings: res.warnings.map((w) => w.code) },
      });
      return { ok: true, warnings: res.warnings, standby: res.standby } as const;
    },
    { timeout: 30000 },
  );
}

/**
 * v2 auto mode: bring a satsang up to date with the clock (design.md §4).
 * Safe to call on every page load; each step is idempotent and logged.
 */
export async function ensureUpToDate(satsangId: number, now = new Date()) {
  const s = await db.satsang.findUnique({ where: { id: satsangId }, include: { batch: { include: { schedule: true } } } });
  if (!s) return;
  const auto = s.batch.schedule?.autoMode ?? false;

  if (s.status !== "COMPLETED" && now.getTime() >= s.startsAt.getTime() + COMPLETE_AFTER_MS) {
    await db.satsang.update({ where: { id: s.id }, data: { status: "COMPLETED" } });
    return;
  }
  if (!auto || s.stateOverride) return;

  if (s.status === "SCHEDULED" && now >= s.opensAt && now < s.closesAt) {
    await db.satsang.update({ where: { id: s.id }, data: { status: "OPEN" } });
    await audit(db, { satsangId: s.id, actor: "SCHEDULER", action: "open" });
  }
  if ((s.status === "SCHEDULED" || s.status === "OPEN") && now >= s.closesAt) {
    await db.satsang.update({ where: { id: s.id }, data: { status: "CLOSED" } });
    await audit(db, { satsangId: s.id, actor: "SCHEDULER", action: "close" });
  }
  if (now >= s.closesAt) {
    await generateAllocation(s.id, "SCHEDULER", { onlyIfMissing: true });
  }
  if (now >= s.publishAt) {
    const fresh = await db.satsang.findUniqueOrThrow({ where: { id: s.id } });
    if (fresh.status === "ALLOCATED" && !fresh.publishPaused) {
      const updated = await db.satsang.updateMany({
        where: { id: s.id, status: "ALLOCATED" },
        data: { status: "PUBLISHED", publishedAt: now },
      });
      if (updated.count > 0) await audit(db, { satsangId: s.id, actor: "SCHEDULER", action: "publish" });
    }
  }
}
