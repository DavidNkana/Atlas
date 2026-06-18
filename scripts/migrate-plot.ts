/**
 * Apply the Plot table migration to the configured Supabase DB.
 *
 * Safe to re-run: every statement is IF NOT EXISTS. The schema
 * in prisma/schema.prisma is the source of truth — this script
 * ensures the table actually exists in the DB that pgbouncer
 * points to. After this passes, /api/plots stops 500-ing.
 *
 * Usage:
 *   DATABASE_URL=... pnpm migrate:plot
 *
 * pgbouncer rejects multi-statement prepared queries (P2010 /
 * 42601), so we run each DDL statement in its own query.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (!process.env.DATABASE_URL.includes("supabase")) {
    console.warn(
      "Warning: DATABASE_URL does not look like a Supabase URL. Continuing anyway."
    );
  }

  console.log("Applying Plot table migration...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Plot" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "questionId" TEXT,
      "suburb" TEXT NOT NULL,
      "city" TEXT NOT NULL,
      "country" TEXT NOT NULL DEFAULT 'South Africa',
      "lat" DOUBLE PRECISION,
      "lng" DOUBLE PRECISION,
      "sizeM2" INTEGER,
      "priceAmount" BIGINT,
      "currency" TEXT NOT NULL DEFAULT 'ZAR',
      "listingType" TEXT NOT NULL DEFAULT 'for_sale',
      "agentName" TEXT,
      "source" TEXT NOT NULL DEFAULT 'user',
      "sourceUrl" TEXT,
      "notes" TEXT,
      "isPublic" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("  OK: Plot table ready");

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Plot_userId_sourceUrl_key" ON "Plot"("userId", "sourceUrl")`
  );
  console.log("  OK: userId+sourceUrl unique index ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Plot_userId_createdAt_idx" ON "Plot"("userId", "createdAt")`
  );
  console.log("  OK: userId+createdAt index ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Plot_questionId_idx" ON "Plot"("questionId")`
  );
  console.log("  OK: questionId index ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Plot_city_suburb_idx" ON "Plot"("city", "suburb")`
  );
  console.log("  OK: city+suburb index ready");

  // Add a foreign key from Plot.questionId -> Question.id so we
  // can join cleanly. IF NOT EXISTS for the FK is not supported
  // in older Postgres, so we wrap in a DO block.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Plot_questionId_fkey'
      ) THEN
        ALTER TABLE "Plot"
          ADD CONSTRAINT "Plot_questionId_fkey"
          FOREIGN KEY ("questionId") REFERENCES "Question"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("  OK: Plot.questionId FK ready");

  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM "Plot"`
  );
  console.log(`Done. Plot row count = ${String(result[0].count)}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
