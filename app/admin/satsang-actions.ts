"use server";
// Admin actions for a week's satsang (spec A4, A5, A8–A12).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, getBatch } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createNextSatsang, generateAllocation } from "@/lib/satsangs";
import { withFlash } from "./ui";

const int = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const allocPath = (id: number) => `/admin/satsangs/${id}/allocation`;

function done(path: string, kind: "msg" | "err", text: string): never {
  revalidatePath("/", "layout");
  redirect(withFlash(path, kind, text));
}

export async function createSatsangAction() {
  await requireAdmin();
  const batch = await getBatch();
  const s = await createNextSatsang(batch.id, "ADMIN");
  done("/admin", "msg", `Created ${s.title}.`);
}

export async function setVotingAction(fd: FormData) {
  await requireAdmin();
  const id = int(fd.get("id"));
  const to = fd.get("to");
  if (!id || (to !== "open" && to !== "close")) done("/admin", "err", "Bad request.");
  const s = await db.satsang.findUniqueOrThrow({ where: { id }, include: { batch: { include: { schedule: true } } } });
  const auto = s.batch.schedule?.autoMode ?? false;
  if (to === "open") {
    if (s.status !== "SCHEDULED" && s.status !== "CLOSED") done("/admin", "err", "Voting can only be opened before it starts or after it was closed.");
    if (s.status === "CLOSED" && (await db.allocationRow.count({ where: { satsangId: id } })) > 0) {
      done("/admin", "err", "An allocation already exists. Clear it on the allocation page before reopening voting.");
    }
    await db.satsang.update({ where: { id }, data: { status: "OPEN", stateOverride: auto ? "open" : null } });
  } else {
    if (s.status !== "OPEN" && s.stateOverride !== "open") done("/admin", "err", "Voting is not open.");
    await db.satsang.update({ where: { id }, data: { status: "CLOSED", stateOverride: auto ? "closed" : null } });
  }
  await audit(db, { satsangId: id, actor: "ADMIN", action: to });
  done("/admin", "msg", to === "open" ? "Voting is open." : "Voting is closed.");
}

export async function updateSatsangAction(fd: FormData) {
  await requireAdmin();
  const id = int(fd.get("id"));
  if (!id) done("/admin", "err", "Bad request.");
  const title = String(fd.get("title") ?? "").trim().slice(0, 80);
  const templateId = int(fd.get("templateId"));
  const backRaw = String(fd.get("back") ?? "/admin");
  const back = backRaw.startsWith("/admin") ? backRaw : "/admin";
  const before = await db.satsang.findUniqueOrThrow({ where: { id } });
  const templateChanged = templateId !== before.templateId;
  const hadRows = (await db.allocationRow.count({ where: { satsangId: id } })) > 0;

  await db.$transaction(async (tx) => {
    await tx.satsang.update({ where: { id }, data: { title: title || before.title, templateId } });
    if (templateChanged && hadRows) {
      await tx.allocationRow.deleteMany({ where: { satsangId: id } });
      if (before.status === "ALLOCATED") await tx.satsang.update({ where: { id }, data: { status: "CLOSED" } });
    }
    await audit(tx, {
      satsangId: id,
      actor: "ADMIN",
      action: "update-satsang",
      before: { title: before.title, templateId: before.templateId },
      after: { title, templateId, discardedDraft: templateChanged && hadRows },
    });
  });
  done(back, "msg", templateChanged && hadRows ? "Template changed; the old draft was discarded. Click Generate." : "Saved.");
}

export async function generateAction(fd: FormData) {
  await requireAdmin();
  const id = int(fd.get("id"));
  if (!id) done("/admin", "err", "Bad request.");
  const res = await generateAllocation(id, "ADMIN");
  if (!res) done(allocPath(id), "err", "Nothing generated.");
  if (!res.ok) {
    const text = {
      NO_TEMPLATE: "Choose a template first.",
      NO_CHANTERS: "No available bhaktas — nothing to allocate.",
      NOT_CLOSED: "Close voting before generating.",
    }[res.error];
    done(allocPath(id), "err", text);
  }
  const notes: string[] = ["Allocation generated."];
  if (res.standby.length) notes.push(`${res.standby.length} on standby — pick a template with more blocks so everyone chants.`);
  if (res.warnings.some((w) => w.code === "NO_BACKUPS")) notes.push("No one volunteered as backup.");
  if (res.warnings.some((w) => w.code === "UNCOVERED_OWN_BLOCK")) notes.push("One backup's own block has no backup.");
  done(allocPath(id), "msg", notes.join(" "));
}

export async function clearAllocationAction(fd: FormData) {
  await requireAdmin();
  const id = int(fd.get("id"));
  if (!id) done("/admin", "err", "Bad request.");
  const s = await db.satsang.findUniqueOrThrow({ where: { id } });
  await db.$transaction(async (tx) => {
    await tx.allocationRow.deleteMany({ where: { satsangId: id } });
    await tx.satsang.update({
      where: { id },
      data: { status: s.status === "SCHEDULED" || s.status === "OPEN" ? s.status : "CLOSED", publishedAt: null },
    });
    await audit(tx, { satsangId: id, actor: "ADMIN", action: "clear-allocation" });
  });
  done(allocPath(id), "msg", "Allocation cleared.");
}

export async function publishAction(fd: FormData) {
  await requireAdmin();
  const id = int(fd.get("id"));
  const to = fd.get("to");
  if (!id) done("/admin", "err", "Bad request.");
  if (to === "publish") {
    if ((await db.allocationRow.count({ where: { satsangId: id } })) === 0) done(allocPath(id), "err", "Generate the allocation first.");
    await db.satsang.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishPaused: false, holdReason: null } });
    await audit(db, { satsangId: id, actor: "ADMIN", action: "publish" });
    done(allocPath(id), "msg", "Published. Bhaktas can now see it.");
  }
  if (to === "unpublish") {
    await db.satsang.update({ where: { id }, data: { status: "ALLOCATED", publishedAt: null } });
    await audit(db, { satsangId: id, actor: "ADMIN", action: "unpublish" });
    done(allocPath(id), "msg", "Unpublished. Bhaktas no longer see it.");
  }
  if (to === "pause" || to === "resume") {
    await db.satsang.update({ where: { id }, data: { publishPaused: to === "pause", ...(to === "resume" ? { holdReason: null } : {}) } });
    await audit(db, { satsangId: id, actor: "ADMIN", action: to === "pause" ? "pause-publish" : "resume-publish" });
    done(allocPath(id), "msg", to === "pause" ? "Auto-publish paused." : "Auto-publish resumed.");
  }
  done(allocPath(id), "err", "Bad request.");
}

/** Change who chants a unit, its backup, or record who covered it on the day (A9, A12). */
export async function editUnitAction(fd: FormData) {
  await requireAdmin();
  const id = int(fd.get("id"));
  const unitNo = int(fd.get("unitNo"));
  const field = String(fd.get("field"));
  const raw = String(fd.get("bhaktaId") ?? "");
  const bhaktaId = raw === "" ? null : int(raw);
  if (!id || !unitNo || !["primary", "backup", "covered"].includes(field)) done("/admin", "err", "Bad request.");

  const rows = await db.allocationRow.findMany({ where: { satsangId: id, unitNo } });
  if (rows.length === 0) done(allocPath(id), "err", "Row not found.");
  const before = { primary: rows[0].primaryBhaktaId, backup: rows[0].backupBhaktaId, covered: rows[0].coveredById };

  const data =
    field === "primary"
      ? { primaryBhaktaId: bhaktaId }
      : field === "backup"
        ? { backupBhaktaId: bhaktaId }
        : { coveredById: bhaktaId, status: bhaktaId ? ("COVERED" as const) : ("ASSIGNED" as const) };

  await db.$transaction(async (tx) => {
    await tx.allocationRow.updateMany({ where: { satsangId: id, unitNo }, data });
    await audit(tx, { satsangId: id, actor: "ADMIN", action: `edit-${field}`, before: { unitNo, ...before }, after: { unitNo, [field]: bhaktaId } });
  });
  done(allocPath(id), "msg", "Saved.");
}

export async function swapUnitsAction(fd: FormData) {
  await requireAdmin();
  const id = int(fd.get("id"));
  const a = int(fd.get("unitA"));
  const b = int(fd.get("unitB"));
  if (!id || !a || !b || a === b) done(id ? allocPath(id) : "/admin", "err", "Pick two different rows to swap.");
  const [ra, rb] = await Promise.all([
    db.allocationRow.findFirst({ where: { satsangId: id, unitNo: a } }),
    db.allocationRow.findFirst({ where: { satsangId: id, unitNo: b } }),
  ]);
  if (!ra || !rb || ra.prefilledName || rb.prefilledName) done(allocPath(id), "err", "Those rows can't be swapped.");
  await db.$transaction(async (tx) => {
    await tx.allocationRow.updateMany({ where: { satsangId: id, unitNo: a }, data: { primaryBhaktaId: rb.primaryBhaktaId } });
    await tx.allocationRow.updateMany({ where: { satsangId: id, unitNo: b }, data: { primaryBhaktaId: ra.primaryBhaktaId } });
    await audit(tx, { satsangId: id, actor: "ADMIN", action: "swap", after: { unitA: a, unitB: b } });
  });
  done(allocPath(id), "msg", "Swapped.");
}
