import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma CLI (migrations): Supabase's direct / session connection when set, otherwise DATABASE_URL.
    // The running app always uses DATABASE_URL (Supabase transaction pooler) — see lib/db.ts.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    // Only needed for local `prisma migrate dev`; production uses `prisma migrate deploy`.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
