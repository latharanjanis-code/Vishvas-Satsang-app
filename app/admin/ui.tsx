// Small shared pieces for admin pages.
import type { ReactNode } from "react";

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <p role="status" className={`rounded-lg px-3 py-2 mb-4 ${err ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok"}`}>
      {err ?? msg}
    </p>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold">{children}</h1>
      {sub && <p className="text-muted mt-1">{sub}</p>}
    </div>
  );
}

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function flashFrom(searchParams: SP) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { msg: one(sp.msg), err: one(sp.err) };
}

/** Builds "?msg=…" / "?err=…" for redirects after an action. */
export function withFlash(path: string, kind: "msg" | "err", text: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${kind}=${encodeURIComponent(text)}`;
}
