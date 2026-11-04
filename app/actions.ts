"use server";
// Public availability form (spec B2–B6).
import { z } from "zod";
import { db, getBatch } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NOT_ON_LIST_MESSAGE, normaliseName } from "@/lib/names";
import { clientIp, hitRateLimit } from "@/lib/rateLimit";
import { currentSatsang, effectiveStatus, ensureUpToDate } from "@/lib/satsangs";
import { CHOICE_LABEL } from "@/lib/labels";
import { shortIST } from "@/lib/time";

export type VoteState =
  | { status: "idle" }
  | { status: "error"; message: string; name?: string; at?: number }
  | { status: "saved"; name: string; choice: string; at: string; changed: boolean };

const schema = z.object({
  name: z.string().trim().min(1, "Please type your name.").max(120),
  choice: z.enum(["AVAILABLE", "NOT_AVAILABLE", "BACKUP"], { message: "Please choose one option." }),
});

export async function submitAvailability(_prev: VoteState, formData: FormData): Promise<VoteState> {
  // Honeypot: real people never fill the hidden "website" field.
  if (String(formData.get("website") ?? "").length > 0) {
    return { status: "saved", name: String(formData.get("name") ?? ""), choice: "", at: "", changed: false };
  }
  if (!(await hitRateLimit(await clientIp()))) {
    return { status: "error", message: "Too many submissions from this device. Please wait 10 minutes and try again." };
  }

  const typed = String(formData.get("name") ?? "").slice(0, 120);
  const parsed = schema.safeParse({ name: formData.get("name"), choice: formData.get("choice") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message, name: typed, at: Date.now() };

  const batch = await getBatch();
  const now = new Date();
  let satsang = await currentSatsang(batch.id, now);
  if (satsang) {
    await ensureUpToDate(satsang.id, now);
    satsang = await currentSatsang(batch.id, now);
  }
  if (!satsang || effectiveStatus(satsang, batch.schedule?.autoMode ?? false, now) !== "OPEN") {
    return { status: "error", message: "Voting is not open right now." };
  }

  const bhakta = await db.bhakta.findFirst({
    where: { batchId: batch.id, nameKey: normaliseName(parsed.data.name), active: true },
  });
  if (!bhakta) {
    await db.rejectedAttempt.create({ data: { satsangId: satsang.id, enteredName: parsed.data.name.slice(0, 120) } });
    return { status: "error", message: NOT_ON_LIST_MESSAGE, name: typed, at: Date.now() };
  }

  const before = await db.response.findUnique({
    where: { satsangId_bhaktaId: { satsangId: satsang.id, bhaktaId: bhakta.id } },
  });
  const saved = await db.response.upsert({
    where: { satsangId_bhaktaId: { satsangId: satsang.id, bhaktaId: bhakta.id } },
    create: { satsangId: satsang.id, bhaktaId: bhakta.id, choice: parsed.data.choice },
    update: { choice: parsed.data.choice },
  });
  await audit(db, {
    satsangId: satsang.id,
    actor: "BHAKTA",
    action: "vote",
    before: before ? { bhaktaId: bhakta.id, choice: before.choice } : undefined,
    after: { bhaktaId: bhakta.id, choice: saved.choice },
  });

  return {
    status: "saved",
    name: bhakta.name,
    choice: CHOICE_LABEL[saved.choice],
    at: shortIST(saved.updatedAt),
    changed: Boolean(before),
  };
}
