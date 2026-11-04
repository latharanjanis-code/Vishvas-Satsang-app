// Public XLSX download of the published allocation (spec B8).
import { connection } from "next/server";
import { loadGrid } from "@/lib/grid";
import { gridToXlsx } from "@/lib/export";
import { publishedSatsang } from "@/lib/published";
import { formatIST } from "@/lib/time";

export async function GET() {
  await connection();
  const { satsang } = await publishedSatsang();
  if (!satsang) return new Response("The allocation has not been published yet.", { status: 404 });
  const grid = await loadGrid(satsang.id);
  const bytes = await gridToXlsx(grid);
  const file = `allocation-${formatIST(satsang.startsAt, "yyyy-MM-dd")}.xlsx`;
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
