"use server";
// Weekly schedule settings (spec A3).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, getBatch } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextSatsangTimes } from "@/lib/time";
import { withFlash } from "./ui";

const PATH = "/admin/schedule";
const day = z.coerce.number().int().min(0).max(6);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

const schema = z.object({
  batchName: z.string().trim().min(1).max(120),
  satsangDay: day,
  satsangTime: time,
  openDay: day,
  openTime: time,
  closeDay: day,
  closeTime: time,
  publishDay: day,
  publishTime: time,
  defaultTemplateId: z.union([z.literal(""), z.coerce.number().int().positive()]),
  autoMode: z.boolean(),
});

export async function saveScheduleAction(fd: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse({ ...Object.fromEntries(fd), autoMode: fd.get("autoMode") === "on" });
  if (!parsed.success) redirect(withFlash(PATH, "err", "Please check the times (HH:MM, 24-hour)."));
  const v = parsed.data;

  // Voting must open, close and publish in that order before the satsang.
  const t = nextSatsangTimes(v, new Date());
  if (!(t.opensAt < t.closesAt && t.closesAt <= t.publishAt && t.publishAt < t.startsAt)) {
    redirect(withFlash(PATH, "err", "Order must be: voting opens → voting closes → publish → satsang, all within the week before."));
  }

  const batch = await getBatch();
  const before = batch.schedule;
  await db.$transaction(async (tx) => {
    await tx.batch.update({ where: { id: batch.id }, data: { name: v.batchName } });
    await tx.weeklySchedule.update({
      where: { batchId: batch.id },
      data: {
        satsangDay: v.satsangDay,
        satsangTime: v.satsangTime,
        openDay: v.openDay,
        openTime: v.openTime,
        closeDay: v.closeDay,
        closeTime: v.closeTime,
        publishDay: v.publishDay,
        publishTime: v.publishTime,
        defaultTemplateId: v.defaultTemplateId === "" ? null : v.defaultTemplateId,
        autoMode: v.autoMode,
      },
    });
    await audit(tx, { actor: "ADMIN", action: "schedule", before, after: v });
  });
  revalidatePath("/", "layout");
  redirect(withFlash(PATH, "msg", "Schedule saved. It applies to satsangs created from now on."));
}
