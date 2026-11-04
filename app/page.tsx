// Bhakta home (spec B1–B6).
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getBatch } from "@/lib/db";
import { currentSatsang, effectiveStatus, ensureUpToDate } from "@/lib/satsangs";
import { formatIST, shortIST } from "@/lib/time";
import { VoteForm } from "./vote-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <HomeContent />
      </Suspense>
    </main>
  );
}

async function HomeContent() {
  await connection();
  const now = new Date();
  const batch = await getBatch();
  let satsang = await currentSatsang(batch.id, now);
  if (satsang) {
    await ensureUpToDate(satsang.id, now);
    satsang = await currentSatsang(batch.id, now);
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-accent">{batch.name}</p>
        <h1 className="text-2xl font-bold mt-1">Weekly Satsang</h1>
      </header>

      {!satsang ? (
        <div className="card">
          <p>The next satsang hasn&apos;t been set up yet. Please check back later.</p>
        </div>
      ) : (
        <SatsangPanel satsang={satsang} autoMode={batch.schedule?.autoMode ?? false} now={now} />
      )}
    </div>
  );
}

function SatsangPanel({
  satsang,
  autoMode,
  now,
}: {
  satsang: NonNullable<Awaited<ReturnType<typeof currentSatsang>>>;
  autoMode: boolean;
  now: Date;
}) {
  const status = effectiveStatus(satsang, autoMode, now);
  const when = `${formatIST(satsang.startsAt, "EEEE d MMMM")}, ${formatIST(satsang.startsAt, "h:mm a").toLowerCase()} IST`;
  const closes = shortIST(satsang.closesAt);
  const publishDay = formatIST(satsang.publishAt, "EEEE");

  const banner = {
    SCHEDULED: { tone: "bg-accent-soft text-accent", text: `Voting opens ${shortIST(satsang.opensAt)} IST` },
    OPEN: { tone: "bg-ok-soft text-ok", text: `Voting open until ${closes} IST` },
    CLOSED: { tone: "bg-warn-soft text-warn", text: `Voting closed — allocation will be shared ${publishDay} morning` },
    ALLOCATED: { tone: "bg-warn-soft text-warn", text: `Voting closed — allocation will be shared ${publishDay} morning` },
    PUBLISHED: { tone: "bg-ok-soft text-ok", text: "Allocation published" },
    COMPLETED: { tone: "bg-accent-soft text-accent", text: "This satsang has been held" },
  }[status];

  return (
    <>
      <section className="card">
        <p className="text-sm text-muted">Next satsang</p>
        <p className="text-xl font-semibold">{when}</p>
        <p className={`mt-3 rounded-lg px-3 py-2 font-semibold ${banner.tone}`}>{banner.text}</p>
        {status === "PUBLISHED" && (
          <Link href="/allocation" className="btn w-full mt-3 text-lg">
            See the slokam allocation
          </Link>
        )}
      </section>

      {status === "OPEN" && <VoteForm closesAt={`${closes} IST`} />}

      {(status === "CLOSED" || status === "ALLOCATED") && (
        <p className="text-muted">
          Changes are no longer possible. If you can&apos;t attend, the backup named next to your slokams will cover them.
        </p>
      )}
    </>
  );
}
