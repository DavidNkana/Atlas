/**
 * Apply the User table migration to Supabase. Idempotent — uses
 * CREATE TABLE IF NOT EXISTS so it's safe to re-run.
 *
 * Usage:
 *   DATABASE_URL=... pnpm migrate:user
 *
 * Adds a User table with the columns the Stripe webhook needs:
 *   id (Clerk user ID, primary key)
 *   email (unique, for the Stripe customer email match)
 *   plan ('free' | 'pro' | 'team', default 'free')
 *   stripeCustomerId, stripeSubscriptionId (unique, for Stripe API)
 *   planUpdatedAt, createdAt, updatedAt
 *
 * The schema in prisma/schema.prisma is the source of truth —
 * this script ensures the live DB matches. We use CREATE TABLE
 * IF NOT EXISTS to avoid breaking on re-runs.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (!process.env.DATABASE_URL.includes("supabase")) {
    console.warn(
      "Warning: DATABASE_URL does not look like a Supabase URL. Continuing anyway.",
    );
  }

  console.log("Applying User table migration...");

  // pgbouncer rejects multi-statement prepared queries, so we
  // split DDL into individual statements.
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "User" (
       "id" TEXT PRIMARY KEY,
       "email" TEXT NOT NULL UNIQUE,
       "plan" TEXT NOT NULL DEFAULT 'free',
       "stripeCustomerId" TEXT UNIQUE,
       "stripeSubscriptionId" TEXT UNIQUE,
       "payfastPaymentId" TEXT UNIQUE,
       "payfastToken" TEXT,
       "payfastMPaymentId" TEXT,
       "planUpdatedAt" TIMESTAMP(3),
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  console.log("  OK: User table created");

  // Day 15: add the PayFast columns to existing User tables that
  // were created without them (from the day 14 migration).
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payfastPaymentId" TEXT`,
  );
  console.log("  OK: payfastPaymentId column ready");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payfastToken" TEXT`,
  );
  console.log("  OK: payfastToken column ready");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payfastMPaymentId" TEXT`,
  );
  console.log("  OK: payfastMPaymentId column ready");

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_payfastPaymentId_key" ON "User"("payfastPaymentId") WHERE "payfastPaymentId" IS NOT NULL`,
  );
  console.log("  OK: payfastPaymentId unique index ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "User_plan_idx" ON "User"("plan")`,
  );
  console.log("  OK: User_plan index ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "User_plan_updatedAt_idx" ON "User"("plan", "planUpdatedAt")`,
  );
  console.log("  OK: User_plan_updatedAt index ready");

  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM "User"`,
  );
  console.log(`Done. User row count = ${String(result[0].count)}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
