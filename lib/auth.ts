// Admin login, sessions and lockout (design.md §10, spec A1).
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export const SESSION_COOKIE = "satsang_admin";
const IDLE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export type LoginResult = { ok: true } | { ok: false; reason: "bad" | "locked"; until?: Date };

export async function checkLogin(username: string, password: string, now = new Date()): Promise<LoginResult> {
  const acct = await db.adminAccount.findUnique({ where: { id: 1 } });
  if (!acct) return { ok: false, reason: "bad" };
  if (acct.lockedUntil && acct.lockedUntil > now) return { ok: false, reason: "locked", until: acct.lockedUntil };

  const good = acct.username === username.trim() && (await bcrypt.compare(password, acct.passwordHash));
  if (good) {
    await db.adminAccount.update({ where: { id: 1 }, data: { failedAttempts: 0, lockedUntil: null } });
    return { ok: true };
  }
  const attempts = acct.failedAttempts + 1;
  const lock = attempts >= LOCK_AFTER;
  await db.adminAccount.update({
    where: { id: 1 },
    data: lock ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) } : { failedAttempts: attempts },
  });
  return lock ? { ok: false, reason: "locked", until: new Date(now.getTime() + LOCK_MS) } : { ok: false, reason: "bad" };
}

/** Call only from a Server Action or Route Handler (sets a cookie). */
export async function startSession() {
  const token = randomBytes(32).toString("base64url");
  await db.adminSession.create({ data: { id: sha256(token) } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.adminSession.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type AdminSession = { sessionId: string; mustChangePassword: boolean; username: string };

export async function getSession(now = new Date()): Promise<AdminSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const session = await db.adminSession.findUnique({ where: { id } });
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_LIMIT_MS) {
    await db.adminSession.delete({ where: { id } });
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.adminSession.update({ where: { id }, data: { lastSeenAt: now } });
  }
  const acct = await db.adminAccount.findUnique({ where: { id: 1 } });
  if (!acct) return null;
  return { sessionId: id, mustChangePassword: acct.mustChangePassword, username: acct.username };
}

/**
 * Use at the top of every admin page and admin Server Action.
 * Sends the admin to the change-password page until the first-login change is done.
 */
export async function requireAdmin(opts: { allowPasswordChange?: boolean } = {}): Promise<AdminSession> {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  if (s.mustChangePassword && !opts.allowPasswordChange) redirect("/admin/account");
  return s;
}

export async function changePassword(
  session: AdminSession,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const acct = await db.adminAccount.findUnique({ where: { id: 1 } });
  if (!acct) return { ok: false, error: "Account not found." };
  if (!(await bcrypt.compare(current, acct.passwordHash))) return { ok: false, error: "Current password is wrong." };
  if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (next === current) return { ok: false, error: "New password must be different from the current one." };
  await db.$transaction([
    db.adminAccount.update({ where: { id: 1 }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } }),
    db.adminSession.deleteMany({ where: { id: { not: session.sessionId } } }),
  ]);
  return { ok: true };
}
