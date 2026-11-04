// Admin XLSX download, including drafts (spec A11).
import { connection } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadGrid } from "@/lib/grid";
import { gridToXlsx } from "@/lib/export";
import { formatIST } from "@/lib/time";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("Sign in first.", { status: 401 });
  const id = Number((await ctx.params).id);
  const s = Number.isInteger(id) ? await db.satsang.findUnique({ where: { id } }) : null;
  if (!s) return new Response("Not found", { status: 404 });
  const bytes = await gridToXlsx(await loadGrid(id));
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="allocation-${formatIST(s.startsAt, "yyyy-MM-dd")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
