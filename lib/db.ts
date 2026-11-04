import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// One client per server process (reused across hot reloads in development).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** The single batch this portal serves (v1 has one batch). */
export async function getBatch() {
  const batch = await db.batch.findFirst({ where: { active: true }, orderBy: { id: "asc" }, include: { schedule: true } });
  if (!batch) throw new Error("No batch set up. Run: npm run db:seed");
  return batch;
}
