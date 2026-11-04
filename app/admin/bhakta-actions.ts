"use server";
// Master list (spec A2, design.md §6–§7).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, getBatch } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cleanName, normaliseName } from "@/lib/names";
import { previewMasterList, type ImportRow } from "@/lib/masterList";
import { withFlash } from "./ui";

const PATH = "/admin/bhaktas";
function done(kind: "msg" | "err", text: string): never {
  revalidatePath(PATH);
  redirect(withFlash(PATH, kind, text));
}

export async function addBhaktaAction(fd: FormData) {
  await requireAdmin();
  const name = cleanName(String(fd.get("name") ?? ""));
  if (!name) done("err", "Type a name.");
  const batch = await getBatch();
  const existing = await db.bhakta.findUnique({ where: { batchId_nameKey: { batchId: batch.id, nameKey: normaliseName(name) } } });
  if (existing) {
    if (!existing.active) {
      await db.bhakta.update({ where: { id: existing.id }, data: { active: true } });
      await audit(db, { actor: "ADMIN", action: "reactivate-bhakta", after: { id: existing.id } });
      done("msg", `"${existing.name}" was already on the list and has been reactivated.`);
    }
    done("msg", `Already on the list: "${existing.name}".`);
  }
  const max = await db.bhakta.aggregate({ where: { batchId: batch.id }, _max: { listOrder: true } });
  const b = await db.bhakta.create({
    data: { batchId: batch.id, name, nameKey: normaliseName(name), listOrder: (max._max.listOrder ?? 0) + 1 },
  });
  await audit(db, { actor: "ADMIN", action: "add-bhakta", after: { id: b.id, name } });
  done("msg", `Added "${name}".`);
}

export async function updateBhaktaAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const b = await db.bhakta.findUnique({ where: { id } });
  if (!b) done("err", "Not found.");
  const name = cleanName(String(fd.get("name") ?? b.name));
  const order = Number(fd.get("listOrder") ?? b.listOrder);
  if (!name) done("err", "Name can't be empty.");
  if (normaliseName(name) !== b.nameKey) {
    const clash = await db.bhakta.findUnique({ where: { batchId_nameKey: { batchId: b.batchId, nameKey: normaliseName(name) } } });
    if (clash) done("err", `Already on the list: "${clash.name}". Renaming onto an existing name isn't allowed.`);
  }
  await db.bhakta.update({
    where: { id },
    data: { name, nameKey: normaliseName(name), listOrder: Number.isInteger(order) && order > 0 ? order : b.listOrder },
  });
  await audit(db, { actor: "ADMIN", action: "edit-bhakta", before: { name: b.name, listOrder: b.listOrder }, after: { name, listOrder: order } });
  done("msg", "Saved.");
}

export async function toggleBhaktaAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const b = await db.bhakta.findUnique({ where: { id } });
  if (!b) done("err", "Not found.");
  await db.bhakta.update({ where: { id }, data: { active: !b.active } });
  await audit(db, { actor: "ADMIN", action: b.active ? "deactivate-bhakta" : "reactivate-bhakta", after: { id, name: b.name } });
  done("msg", `${b.name} ${b.active ? "deactivated" : "reactivated"}.`);
}

export type ImportPreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: (ImportRow & { existing: "new" | "active" | "inactive" })[];
      blankRows: number[];
      mergedInFile: { name: string; rows: number[] }[];
    };

export async function previewImportAction(fd: FormData): Promise<ImportPreviewResult> {
  await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  if (file.size > 1024 * 1024) return { ok: false, error: "File is larger than 1 MB." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { ok: false, error: "Use an .xlsx or .csv file." };
  try {
    const preview = await previewMasterList(file.name, new Uint8Array(await file.arrayBuffer()));
    const batch = await getBatch();
    const existing = await db.bhakta.findMany({ where: { batchId: batch.id }, select: { nameKey: true, active: true } });
    const byKey = new Map(existing.map((e) => [e.nameKey, e.active]));
    return {
      ok: true,
      rows: preview.rows.map((r) => {
        const a = byKey.get(normaliseName(r.name));
        return { ...r, existing: a === undefined ? "new" : a ? "active" : "inactive" };
      }),
      blankRows: preview.blankRows,
      mergedInFile: preview.mergedInFile,
    };
  } catch (e) {
    return { ok: false, error: `Couldn't read the file: ${(e as Error).message}` };
  }
}

const commitSchema = z.array(z.string().max(120)).max(2000);

export async function commitImportAction(namesJson: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const parsed = commitSchema.safeParse(JSON.parse(namesJson));
  if (!parsed.success) return { ok: false, message: "Bad import data." };
  const batch = await getBatch();
  let added = 0;
  let already = 0;
  let reactivated = 0;
  let merged = 0;
  await db.$transaction(async (tx) => {
    const max = await tx.bhakta.aggregate({ where: { batchId: batch.id }, _max: { listOrder: true } });
    let order = max._max.listOrder ?? 0;
    const seen = new Set<string>();
    for (const raw of parsed.data) {
      const name = cleanName(raw);
      if (!name) continue;
      const key = normaliseName(name);
      if (seen.has(key)) {
        merged++;
        continue;
      }
      seen.add(key);
      const existing = await tx.bhakta.findUnique({ where: { batchId_nameKey: { batchId: batch.id, nameKey: key } } });
      if (existing) {
        if (!existing.active) {
          await tx.bhakta.update({ where: { id: existing.id }, data: { active: true } });
          reactivated++;
        } else already++;
        continue;
      }
      await tx.bhakta.create({ data: { batchId: batch.id, name, nameKey: key, listOrder: ++order } });
      added++;
    }
    await audit(tx, { actor: "ADMIN", action: "import-master-list", after: { added, already, reactivated, merged } });
  });
  revalidatePath(PATH);
  return {
    ok: true,
    message: `Import done: ${added} added, ${already} already on the list, ${reactivated} reactivated${merged ? `, ${merged} duplicates merged` : ""}.`,
  };
}
