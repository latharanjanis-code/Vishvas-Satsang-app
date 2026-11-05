-- Supabase exposes tables in the "public" schema through its Data API.
-- The portal never uses that API, so row-level security is switched on with no policies:
-- the Data API can then read or change nothing. The app connects as the database owner,
-- which is not affected by row-level security, so it keeps working as before.
ALTER TABLE "AdminAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Batch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bhakta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklySchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SlokamTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TemplateRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Satsang" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RejectedAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AllocationRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitHit" ENABLE ROW LEVEL SECURITY;
-- Prisma's own bookkeeping table (absent in Prisma's scratch database, hence the check).
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
