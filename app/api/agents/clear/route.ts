import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const result = await prisma.agent.deleteMany({});
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
