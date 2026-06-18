import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * Day 10+ — Plots API (Path 4: "Add a listing" feature).
 *
 * Endpoints:
 *   POST /api/plots    — create a new plot (listing)
 *   GET  /api/plots    — list plots (filtered by questionId / userId)
 *   DELETE /api/plots/[id] — soft-style delete (hard delete for v1)
 *
 * Auth: required. Plots are scoped to the current user via userId.
 *
 * Plot rows are PRIVATE (isPublic = false) by default. v1 has no
 * share/team feature; v2 will add a share-with-team flow for the
 * "Pro" tier.
 */

export const dynamic = "force-dynamic";

const VALID_LISTING_TYPES = new Set([
  "for_sale",
  "auction",
  "tender",
  "off_market",
]);

const VALID_CURRENCIES = new Set([
  "ZAR",
  "ZMW",
  "KES",
  "NGN",
  "USD",
  "EUR",
  "GBP",
]);

// Field length caps — defensive against malformed input.
const MAX_SUBURB = 80;
const MAX_CITY = 60;
const MAX_COUNTRY = 60;
const MAX_AGENT = 120;
const MAX_URL = 500;
const MAX_NOTES = 1000;

interface PlotCreateBody {
  // After validation, suburb and city are guaranteed non-empty
  // strings. We mark them required here so the consumer code
  // doesn't have to deal with `string | undefined`.
  questionId?: string;
  sourceUrl?: string;
  suburb: string;
  city: string;
  country: string;
  sizeM2?: number;
  priceAmount?: number;
  currency: string;
  listingType: string;
  agentName?: string;
  lat?: number;
  lng?: number;
  notes?: string;
}

function validateBody(body: any): { ok: true; data: PlotCreateBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body required" };
  }
  const suburb = typeof body.suburb === "string" ? body.suburb.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (!suburb) return { ok: false, error: "suburb required" };
  if (!city) return { ok: false, error: "city required" };
  if (suburb.length > MAX_SUBURB) return { ok: false, error: `suburb max ${MAX_SUBURB} chars` };
  if (city.length > MAX_CITY) return { ok: false, error: `city max ${MAX_CITY} chars` };

  const country = typeof body.country === "string" && body.country.trim()
    ? body.country.trim().slice(0, MAX_COUNTRY)
    : "South Africa";

  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim()
    ? body.sourceUrl.trim().slice(0, MAX_URL)
    : null;
  const agentName = typeof body.agentName === "string" && body.agentName.trim()
    ? body.agentName.trim().slice(0, MAX_AGENT)
    : null;
  const notes = typeof body.notes === "string" && body.notes.trim()
    ? body.notes.trim().slice(0, MAX_NOTES)
    : null;

  const questionId = typeof body.questionId === "string" && body.questionId.trim()
    ? body.questionId.trim()
    : null;

  const sizeM2 = typeof body.sizeM2 === "number" && Number.isFinite(body.sizeM2) && body.sizeM2 > 0
    ? Math.floor(body.sizeM2)
    : null;
  const priceAmount = typeof body.priceAmount === "number" && Number.isFinite(body.priceAmount) && body.priceAmount > 0
    ? Math.floor(body.priceAmount)
    : null;
  const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;

  const currency = typeof body.currency === "string" && VALID_CURRENCIES.has(body.currency)
    ? body.currency
    : "ZAR";

  const listingType = typeof body.listingType === "string" && VALID_LISTING_TYPES.has(body.listingType)
    ? body.listingType
    : "for_sale";

  return {
    ok: true,
    data: {
      questionId: questionId || undefined,
      sourceUrl: sourceUrl || undefined,
      suburb: suburb as string,
      city: city as string,
      country,
      sizeM2: sizeM2 ?? undefined,
      priceAmount: priceAmount ?? undefined,
      currency,
      listingType,
      agentName: agentName || undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      notes: notes || undefined,
    },
  };
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const { userId } = getAuth(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // 2. Parse + validate
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const v = validateBody(raw);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const data = v.data;

  // 3. Optional: if questionId is provided, verify the question
  // belongs to this user. We don't want users attaching plots
  // to other users' questions.
  if (data.questionId) {
    const q = await prisma.question.findFirst({
      where: { id: data.questionId, userId },
      select: { id: true },
    });
    if (!q) {
      return NextResponse.json(
        { error: "questionId not found or not yours" },
        { status: 404 }
      );
    }
  }

  // 4. Persist. If a sourceUrl is provided AND the user has
  // already added the same URL, the @@unique constraint will
  // fail. We catch and return the existing plot instead of
  // creating a duplicate.
  const source = data.sourceUrl ? "property24_url" : "manual";

  try {
    if (data.sourceUrl) {
      const existing = await prisma.plot.findUnique({
        where: { userId_sourceUrl: { userId, sourceUrl: data.sourceUrl } },
      });
      if (existing) {
        // Update the existing plot in place — user is just
        // refreshing the price/size/notes for the same URL.
        const updated = await prisma.plot.update({
          where: { id: existing.id },
          data: {
            suburb: data.suburb,
            city: data.city,
            country: data.country,
            sizeM2: data.sizeM2 ?? null,
            priceAmount: data.priceAmount != null ? BigInt(data.priceAmount) : null,
            currency: data.currency,
            listingType: data.listingType,
            agentName: data.agentName ?? null,
            lat: data.lat ?? null,
            lng: data.lng ?? null,
            notes: data.notes ?? null,
            questionId: data.questionId ?? existing.questionId,
          },
        });
        return NextResponse.json({ ok: true, plot: serialize(updated), deduped: true });
      }
    }

    const created = await prisma.plot.create({
      data: {
        userId,
        questionId: data.questionId ?? null,
        suburb: data.suburb,
        city: data.city,
        country: data.country,
        sizeM2: data.sizeM2 ?? null,
        priceAmount: data.priceAmount != null ? BigInt(data.priceAmount) : null,
        currency: data.currency,
        listingType: data.listingType,
        agentName: data.agentName ?? null,
        source,
        sourceUrl: data.sourceUrl ?? null,
        notes: data.notes ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        isPublic: false,
      },
    });
    return NextResponse.json({ ok: true, plot: serialize(created) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[plots] create failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const questionId = url.searchParams.get("questionId");

  try {
    // If a questionId is given AND the user owns the question, we
    // return all plots the user has added that are linked to
    // that question. If no questionId, we return the user's
    // recent plots (the "My plots" list).
    let rows;
    if (questionId) {
      // Verify ownership of the question first.
      const q = await prisma.question.findFirst({
        where: { id: questionId, userId },
        select: { id: true },
      });
      if (!q) {
        return NextResponse.json(
          { error: "questionId not found or not yours" },
          { status: 404 }
        );
      }
      rows = await prisma.plot.findMany({
        where: { userId, questionId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } else {
      rows = await prisma.plot.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }
    return NextResponse.json({
      ok: true,
      plots: rows.map(serialize),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Serialise a Plot row for the JSON response. BigInt prices can't
 * be JSON-stringified natively, so we convert to Number. For
 * prices over Number.MAX_SAFE_INTEGER (~9e15) the conversion
 * loses precision, but no real African land plot is that
 * expensive in local currency, so we're safe.
 */
function serialize(p: any) {
  return {
    id: p.id,
    suburb: p.suburb,
    city: p.city,
    country: p.country,
    lat: p.lat,
    lng: p.lng,
    sizeM2: p.sizeM2,
    priceAmount: p.priceAmount != null ? Number(p.priceAmount) : null,
    currency: p.currency,
    listingType: p.listingType,
    agentName: p.agentName,
    source: p.source,
    sourceUrl: p.sourceUrl,
    notes: p.notes,
    isPublic: p.isPublic,
    questionId: p.questionId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
