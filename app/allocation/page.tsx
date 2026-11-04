// Read-only allocation for bhaktas (spec B7–B8).
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { loadGrid } from "@/lib/grid";
import { publishedSatsang } from "@/lib/published";
import { formatIST, shortIST } from "@/lib/time";
import { db } from "@/lib/db";
import { GridView } from "./grid-view";

export const metadata = { title: "Slokam allocation · Satsang Portal" };

export default function AllocationPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  await connection();
  const { satsang, pending } = await publishedSatsang();

  if (!satsang) {
    return (
      <div className="card space-y-3 max-w-xl">
        <h1 className="text-xl font-bold">Slokam allocation</h1>
        <p>
          {pending
            ? `Allocation will be shared on ${formatIST(pending.publishAt, "EEEE")} morning.`
            : "There is no allocation to show yet."}
        </p>
        <Link href="/" className="btn btn-quiet">
          Back to home
        </Link>
      </div>
    );
  }

  const grid = await loadGrid(satsang.id);
  const lastChange = await db.auditLog.findFirst({
    where: { satsangId: satsang.id, action: { notIn: ["vote", "create", "open", "close"] } },
    orderBy: { at: "desc" },
  });
  const updated = lastChange && satsang.publishedAt && lastChange.at > satsang.publishedAt ? lastChange.at : satsang.publishedAt;

  return (
    <div className="space-y-4">
      <header className="text-center space-y-0.5">
        <p className="font-bold text-lg">{grid.headerLines[0]}</p>
        <p className="font-semibold">{grid.headerLines[1]}</p>
        <p>{grid.headerLines[2]}</p>
      </header>
      <div className="flex flex-wrap gap-2 justify-center no-print">
        <a href="/allocation/xlsx" className="btn btn-quiet">
          Download XLSX
        </a>
        <Link href="/allocation/print" className="btn btn-quiet">
          Download PDF
        </Link>
        <Link href="/" className="btn btn-quiet">
          Home
        </Link>
      </div>
      <GridView lines={grid.lines} />
      {updated && <p className="text-sm text-muted text-center">Last updated: {shortIST(updated)} IST</p>}
    </div>
  );
}
