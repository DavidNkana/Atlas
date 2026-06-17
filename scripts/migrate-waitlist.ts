/**
 * Apply the WaitlistSignup migration to the configured Supabase DB.
 *
 * Safe to re-run: every statement is IF NOT EXISTS. The schema in
 * prisma/schema.prisma is the source of truth — this script just
 * ensures the table actually exists in the DB that pgbouncer points
 * to. After this passes, /api/waitlist stops 500-ing.
 *
 * Usage:
 *   DATABASE_URL=... pnpm migrate:waitlist
 *
 * Note: pgbouncer's transaction-pooling mode rejects multi-statement
 * prepared queries (P2010 / 42601), so this script runs each DDL
 * statement in its own query.
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

  console.log("Applying WaitlistSignup migration...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WaitlistSignup" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT NOT NULL,
      "name" TEXT,
      "vertical" TEXT NOT NULL,
      "plan" TEXT NOT NULL,
      "message" TEXT,
      "userType" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("  OK: WaitlistSignup table ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "WaitlistSignup_createdAt_idx" ON "WaitlistSignup"("createdAt")`
  );
  console.log("  OK: createdAt index ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "WaitlistSignup_plan_idx" ON "WaitlistSignup"("plan")`
  );
  console.log("  OK: plan index ready");

  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM "WaitlistSignup"`
  );
  console.log(`Done. WaitlistSignup row count = ${String(result[0].count)}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
