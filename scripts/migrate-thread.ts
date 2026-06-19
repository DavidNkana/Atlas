/**
 * Day 18 — Thread + Message migration.
 *
 * pgbouncer rejects multi-statement prepared queries, so we split
 * DDL into individual statements. Idempotent: safe to run multiple
 * times.
 */

import { prisma } from "../lib/db";

async function main() {
  console.log("Applying Thread + Message migration...");

  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "Thread" (
       "id" TEXT PRIMARY KEY,
       "userId" TEXT NOT NULL,
       "title" TEXT NOT NULL,
       "messageCount" INTEGER NOT NULL DEFAULT 0,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
     )`,
  );
  console.log("  OK: Thread table created");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Thread_userId_updatedAt_idx" ON "Thread"("userId", "updatedAt")`,
  );
  console.log("  OK: Thread userId+updatedAt index");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Thread_userId_createdAt_idx" ON "Thread"("userId", "createdAt")`,
  );
  console.log("  OK: Thread userId+createdAt index");

  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "Message" (
       "id" TEXT PRIMARY KEY,
       "threadId" TEXT NOT NULL,
       "role" TEXT NOT NULL,
       "content" TEXT NOT NULL,
       "question" TEXT,
       "intent" TEXT,
       "sources" JSONB,
       "spatialQuestionId" TEXT,
       "spatialModel" TEXT,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE
     )`,
  );
  console.log("  OK: Message table created");

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt")`,
  );
  console.log("  OK: Message threadId+createdAt index");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
