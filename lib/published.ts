import { getBatch } from "./db";
import { currentSatsang, effectiveStatus, ensureUpToDate } from "./satsangs";

/** The current satsang if its allocation is published; otherwise null plus when it will be. */
export async function publishedSatsang(now = new Date()) {
  const batch = await getBatch();
  let s = await currentSatsang(batch.id, now);
  if (s) {
    await ensureUpToDate(s.id, now);
    s = await currentSatsang(batch.id, now);
  }
  if (!s) return { batch, satsang: null, pending: null };
  const status = effectiveStatus(s, batch.schedule?.autoMode ?? false, now);
  if (status === "PUBLISHED") return { batch, satsang: s, pending: null };
  return { batch, satsang: null, pending: s };
}
