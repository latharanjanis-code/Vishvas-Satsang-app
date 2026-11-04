import { db } from "./db";
import type { Prisma } from "./generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof db;

export async function audit(
  tx: Tx,
  entry: { satsangId?: number | null; actor: "ADMIN" | "SCHEDULER" | "BHAKTA"; action: string; before?: unknown; after?: unknown },
) {
  await tx.auditLog.create({
    data: {
      satsangId: entry.satsangId ?? null,
      actor: entry.actor,
      action: entry.action,
      before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
    },
  });
}
