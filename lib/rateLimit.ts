// Availability-form rate limit: 10 submissions per IP per 10 minutes (design.md §10).
// Raw IPs are never stored: the key is a hash of IP + a salt that changes daily.
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "./db";

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 10;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Returns true when this request is allowed. */
export async function hitRateLimit(ip: string, now = new Date()): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const key = createHash("sha256").update(`${process.env.CRON_SECRET ?? "dev"}:${day}:${ip}`).digest("hex");
  const windowEnd = new Date(Math.ceil(now.getTime() / WINDOW_MS) * WINDOW_MS);
  const row = await db.rateLimitHit.upsert({
    where: { key_windowEnd: { key, windowEnd } },
    create: { key, windowEnd, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count <= LIMIT;
}
