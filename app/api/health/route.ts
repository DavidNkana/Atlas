import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = {
    timestamp: new Date().toISOString(),
    runtime: process.env.NEXT_RUNTIME || "unknown",
    nodeVersion: process.version,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlLength: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
    databaseUrlPrefix: process.env.DATABASE_URL
      ? process.env.DATABASE_URL.substring(0, 25) + "..."
      : "NOT SET",
  };

  try {
    const count = await prisma.question.count();
    return NextResponse.json({
      ...result,
      prismaConnection: "OK",
      questionCount: count,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ...result,
        prismaConnection: "FAILED",
        prismaError: err instanceof Error ? err.message : String(err),
        prismaErrorName: err instanceof Error ? err.name : "Unknown",
      },
      { status: 500 },
    );
  }
}