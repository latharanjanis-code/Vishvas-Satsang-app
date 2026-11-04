"use server";
// Slokam templates (spec A6, design.md §6).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, getBatch } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { listSheets, parseTemplate, TemplateError, type ParsedLine } from "@/lib/templates";
import { saveTemplate } from "@/lib/templateStore";
import { withFlash } from "./ui";

const PATH = "/admin/templates";
function done(kind: "msg" | "err", text: string): never {
  revalidatePath(PATH);
  redirect(withFlash(PATH, kind, text));
}

async function readFile(fd: FormData): Promise<{ name: string; data: Uint8Array } | string> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a file.";
  if (file.size > 1024 * 1024) return "File is larger than 1 MB.";
  if (!/\.xlsx$/i.test(file.name)) return "Use an .xlsx file.";
  return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
}

export type SheetPreview =
  | { sheetName: string; ok: false; error: string }
  | { sheetName: string; ok: true; lines: ParsedLine[]; fillUnits: number; wasFilled: boolean };

export async function previewTemplateAction(fd: FormData): Promise<{ ok: false; error: string } | { ok: true; fileName: string; sheets: SheetPreview[] }> {
  await requireAdmin();
  const f = await readFile(fd);
  if (typeof f === "string") return { ok: false, error: f };
  const batch = await getBatch();
  try {
    const names = await listSheets(f.data);
    const sheets: SheetPreview[] = [];
    for (const sheetName of names) {
      try {
        const p = await parseTemplate(f.data, { sheetName, fixedNames: batch.fixedNames });
        sheets.push({ sheetName, ok: true, lines: p.lines, fillUnits: p.fillUnits, wasFilled: p.wasFilled });
      } catch (e) {
        sheets.push({ sheetName, ok: false, error: e instanceof TemplateError ? e.message : "Couldn't read this sheet." });
      }
    }
    return { ok: true, fileName: f.name, sheets };
  } catch (e) {
    return { ok: false, error: `Couldn't read the file: ${(e as Error).message}` };
  }
}

const saveSchema = z.array(
  z.object({
    sheetName: z.string(),
    name: z.string().trim().min(1).max(80),
    slokamsPerBhakta: z.number().int().min(1).max(50),
    kinds: z.record(z.string(), z.enum(["BLOCK", "NAMED_PART", "SINGLE_PRAYER", "PREFILLED"])),
  }),
);

export async function saveTemplatesAction(fd: FormData): Promise<{ ok: false; error: string } | { ok: true; message: string }> {
  await requireAdmin();
  const f = await readFile(fd);
  if (typeof f === "string") return { ok: false, error: f };
  const parsed = saveSchema.safeParse(JSON.parse(String(fd.get("config") ?? "[]")));
  if (!parsed.success || parsed.data.length === 0) return { ok: false, error: "Tick at least one sheet and give it a name." };
  const batch = await getBatch();
  const saved: string[] = [];
  for (const sheet of parsed.data) {
    const p = await parseTemplate(f.data, { sheetName: sheet.sheetName, fixedNames: batch.fixedNames });
    const overrides = Object.fromEntries(Object.entries(sheet.kinds).map(([k, v]) => [Number(k), v]));
    const t = await saveTemplate({
      name: sheet.name,
      slokamsPerBhakta: sheet.slokamsPerBhakta,
      sourceFile: `${f.name} / ${sheet.sheetName}`,
      parsed: p,
      kindOverrides: overrides,
    });
    await audit(db, { actor: "ADMIN", action: "add-template", after: { id: t.id, name: t.name, source: t.sourceFile } });
    saved.push(t.name);
    if (!batch.schedule?.defaultTemplateId) {
      await db.weeklySchedule.update({ where: { batchId: batch.id }, data: { defaultTemplateId: t.id } });
    }
  }
  revalidatePath(PATH);
  return { ok: true, message: `Saved: ${saved.join(", ")}.` };
}

export async function setDefaultTemplateAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const batch = await getBatch();
  await db.weeklySchedule.update({ where: { batchId: batch.id }, data: { defaultTemplateId: id } });
  await audit(db, { actor: "ADMIN", action: "default-template", after: { id } });
  done("msg", "Default template set. New satsangs will start with it.");
}

export async function editTemplateAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const per = Number(fd.get("slokamsPerBhakta"));
  if (!name || !Number.isInteger(per) || per < 1) done("err", "Give a name and a whole number of slokams per bhakta.");
  await db.slokamTemplate.update({ where: { id }, data: { name, slokamsPerBhakta: per } });
  done("msg", "Saved.");
}

export async function deleteTemplateAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const t = await db.slokamTemplate.findUnique({ where: { id } });
  if (!t) done("err", "Not found.");
  await db.slokamTemplate.delete({ where: { id } });
  await audit(db, { actor: "ADMIN", action: "delete-template", before: { id, name: t.name } });
  done("msg", `Deleted "${t.name}". Allocations already made keep their rows.`);
}

export async function fixedNamesAction(fd: FormData) {
  await requireAdmin();
  const batch = await getBatch();
  const names = String(fd.get("fixedNames") ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  await db.batch.update({ where: { id: batch.id }, data: { fixedNames: names } });
  done("msg", `Fixed names: ${names.join(", ") || "none"}. This applies to templates uploaded from now on.`);
}
