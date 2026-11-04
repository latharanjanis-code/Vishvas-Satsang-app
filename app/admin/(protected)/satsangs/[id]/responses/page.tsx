// Response lists (spec A7).
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { responseSummary } from "@/lib/responses";
import { shortIST } from "@/lib/time";
import { PageTitle } from "../../../../ui";

type Props = { params: Promise<{ id: string }> };

export default function ResponsesPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Props) {
  await connection();
  await requireAdmin();
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await db.satsang.findUnique({ where: { id } }) : null;
  if (!s) notFound();
  const r = await responseSummary(s.id, s.batchId);

  const lists: { title: string; tone: string; items: { key: string | number; name: string; at?: Date }[] }[] = [
    { title: "Available", tone: "text-ok", items: r.available.map((x) => ({ key: x.id, name: x.bhakta.name, at: x.updatedAt })) },
    { title: "Available + backup", tone: "text-ok", items: r.backup.map((x) => ({ key: x.id, name: x.bhakta.name, at: x.updatedAt })) },
    { title: "Not available", tone: "", items: r.notAvailable.map((x) => ({ key: x.id, name: x.bhakta.name, at: x.updatedAt })) },
    { title: "No response", tone: "text-warn", items: r.noResponse.map((b) => ({ key: b.id, name: b.name })) },
    {
      title: "Not on list (refused)",
      tone: "text-bad",
      items: r.rejected.map((x) => ({ key: `r${x.id}`, name: x.enteredName, at: x.attemptedAt })),
    },
  ];

  return (
    <>
      <PageTitle sub={`${shortIST(s.startsAt)} IST · voting ${shortIST(s.opensAt)} – ${shortIST(s.closesAt)}`}>
        Responses · {s.title}
      </PageTitle>
      <p className="mb-4 flex gap-4 text-sm">
        <Link className="underline" href="/admin">
          ← This week
        </Link>
        <Link className="underline" href={`/admin/satsangs/${s.id}/allocation`}>
          Allocation →
        </Link>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((l) => (
          <section key={l.title} className="card">
            <h2 className={`font-semibold mb-2 ${l.tone}`}>
              {l.title} <span className="tabular-nums">({l.items.length})</span>
            </h2>
            {l.items.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              <ul className="space-y-0.5 text-sm max-h-96 overflow-auto">
                {l.items.map((i) => (
                  <li key={i.key} className="flex justify-between gap-2">
                    <span>{i.name}</span>
                    {i.at && <span className="text-muted tabular-nums">{shortIST(i.at)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
