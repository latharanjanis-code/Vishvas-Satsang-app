"use server";
import { redirect } from "next/navigation";
import { changePassword, checkLogin, endSession, requireAdmin, startSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { shortIST } from "@/lib/time";

export type FormState = { error?: string; ok?: string; next?: string };

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const username = String(fd.get("username") ?? "");
  const password = String(fd.get("password") ?? "");
  const res = await checkLogin(username, password);
  if (!res.ok) {
    if (res.reason === "locked") {
      return { error: `Too many wrong attempts. Try again after ${res.until ? shortIST(res.until) : "15 minutes"} IST.` };
    }
    return { error: "Wrong username or password." };
  }
  await startSession();
  redirect("/admin");
}

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireAdmin({ allowPasswordChange: true });
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The two new passwords don't match." };
  const res = await changePassword(session, String(fd.get("current") ?? ""), next);
  if (!res.ok) return { error: res.error };
  await audit(db, { actor: "ADMIN", action: "change-password" });
  return {
    ok: "Password changed. Other devices have been signed out.",
    next: session.mustChangePassword ? "/admin" : undefined,
  };
}
