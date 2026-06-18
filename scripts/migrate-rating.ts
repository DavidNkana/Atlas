/**
 * Apply the rating/ratingNote/ratedAt columns to the Question table
 * on Supabase. Idempotent — uses ADD COLUMN IF NOT EXISTS so it's
 * safe to re-run.
 *
 * Usage:
 *   DATABASE_URL=... pnpm migrate:rating
 *
 * The schema in prisma/schema.prisma is the source of truth — this
 * script ensures the live DB matches.
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

  console.log("Applying Question.rating migration...");

  // pgbouncer rejects multi-statement prepared queries, so we
  // split DDL into individual statements.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "rating" INTEGER`
  );
  console.log("  OK: rating column ready");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "ratingNote" TEXT`
  );
  console.log("  OK: ratingNote column ready");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "ratedAt" TIMESTAMP(3)`
  );
  console.log("  OK: ratedAt column ready");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Question_vertical_rating_idx" ON "Question"("vertical", "rating")`
  );
  console.log("  OK: vertical_rating index ready");

  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM "Question"`
  );
  console.log(`Done. Question row count = ${String(result[0].count)}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
