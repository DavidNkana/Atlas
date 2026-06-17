import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const result: any = { timestamp: new Date().toISOString() };

  try {
    const body = await req.json();
    result.parsedBody = body;
  } catch (e) {
    result.bodyParseError = String(e);
  }

  try {
    const authResult = await auth();
    result.authKeys = authResult ? Object.keys(authResult) : "null";
    result.userId = authResult?.userId ?? null;
  } catch (e) {
    result.authError = e instanceof Error ? e.message : String(e);
    result.authErrorStack = e instanceof Error ? e.stack : "";
  }

  try {
    const count = await prisma.question.count();
    result.prismaCount = count;
    const sample = await prisma.question.findFirst();
    result.prismaFindFirst = sample ? "OK with id " + sample.id : "empty table";
  } catch (e) {
    result.prismaError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}