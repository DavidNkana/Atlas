import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * In dev (Next.js hot-reload), instantiating a new PrismaClient on every
 * file change exhausts the database connection pool. We stash the instance
 * on globalThis so hot-reloads reuse the same client.
 *
 * In production, a single instance is created and used for the lifetime of
 * the server process.
 */
declare global {
  // eslint-disable-next-line no-var
  var __atlas_prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__atlas_prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__atlas_prisma__ = prisma;
}
