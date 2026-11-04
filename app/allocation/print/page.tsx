// Print layout: "Download PDF" opens this page and the browser's Save as PDF (design.md §8).
import { Suspense } from "react";
import { connection } from "next/server";
import { loadGrid } from "@/lib/grid";
import { publishedSatsang } from "@/lib/published";
import { GridView } from "../grid-view";
import { PrintOnLoad } from "./print-on-load";

export const metadata = { title: "Slokam allocation (print)" };

export default function PrintPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-4 bg-white">
      <Suspense fallback={null}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  await connection();
  const { satsang } = await publishedSatsang();
  if (!satsang) return <p>The allocation has not been published yet.</p>;
  const grid = await loadGrid(satsang.id);
  return (
    <div className="space-y-3">
      <PrintOnLoad />
      <header className="text-center">
        <p className="font-bold">{grid.headerLines[0]}</p>
        <p className="font-semibold">{grid.headerLines[1]}</p>
        <p>{grid.headerLines[2]}</p>
      </header>
      <GridView lines={grid.lines} search={false} />
    </div>
  );
}
