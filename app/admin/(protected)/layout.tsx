import Link from "next/link";
import { logoutAction } from "../auth-actions";

const NAV = [
  { href: "/admin", label: "This week" },
  { href: "/admin/bhaktas", label: "Master list" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/account", label: "Password" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/admin" className="font-bold text-accent mr-2">
            Satsang admin
          </Link>
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="py-1 hover:underline">
                {n.label}
              </Link>
            ))}
            <Link href="/" className="py-1 hover:underline text-muted">
              Public page ↗
            </Link>
          </nav>
          <form action={logoutAction} className="ml-auto">
            <button className="btn btn-quiet btn-sm">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
    </div>
  );
}
