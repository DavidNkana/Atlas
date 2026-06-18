import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { detectCity } from "@/lib/stub/detect";
import { CITIES, type City } from "@/lib/stub/cities";

/**
 * Day 10+ — Plots API (Path 4: "Add a listing" feature).
 * Day 11 — Cross-user visibility (LinkedIn-style privacy).
 *
 * Endpoints:
 *   POST /api/plots    — create a new plot (listing)
 *   GET  /api/plots    — list plots (filtered by questionId / userId)
 *   DELETE /api/plots/[id] — soft-style delete (hard delete for v1)
 *
 * Auth: required. Plots are scoped to the current user via userId.
 *
 * Privacy model (Day 11):
 *
 *   publishToMarket (default true)
 *     Owner has opted to share this listing with the Atlas
 *     market. The "data fields" (suburb, city, size, price,
 *     currency, listing type, lat/lng) are visible to all
 *     other Atlas users.
 *
 *   revealContact (default false)
 *     Owner has additionally opted to share the "contact
 *     fields" (agent name, source URL) with the Atlas market.
 *     Required to show the "View listing" link to other
 *     users' Property24 pages.
 *
 *   notes
 *     ALWAYS private. The owner keeps notes for themselves.
 *
 * The owner sees all fields regardless of either flag. Other
 * users see data fields if publishToMarket=true, contact
 * fields if BOTH publishToMarket AND revealContact are true.
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
  publishToMarket?: boolean;
  revealContact?: boolean;
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

  // Anti-PII guard: phone numbers, emails, "@" symbols, and
  // long digit runs are not allowed in suburb/city/country.
  // Users put agent phone numbers in `agentName`, not the
  // location fields. If we detect them we 400 so the user
  // sees the error immediately instead of leaking PII to
  // the market.
  if (containsContactInfo(suburb)) {
    return { ok: false, error: "suburb cannot contain phone numbers or emails" };
  }
  if (containsContactInfo(city)) {
    return { ok: false, error: "city cannot contain phone numbers or emails" };
  }

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

  // Privacy toggles. Default publishToMarket = true, revealContact
  // = false. The user can override either on the request body.
  const publishToMarket = typeof body.publishToMarket === "boolean"
    ? body.publishToMarket
    : true;
  const revealContact = typeof body.revealContact === "boolean"
    ? body.revealContact
    : false;

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
      publishToMarket,
      revealContact,
    },
  };
}

function containsContactInfo(s: string): boolean {
  return /[@]/.test(s) || /\+?\d{7,}/.test(s);
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
        // Privacy flags are also updatable (the user might
        // change their mind about sharing after saving).
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
            publishToMarket: data.publishToMarket,
            revealContact: data.revealContact,
          },
        });
        return NextResponse.json({ ok: true, plot: serializeForOwner(updated), deduped: true });
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
        isPublic: data.publishToMarket, // legacy: keep in sync
        publishToMarket: data.publishToMarket,
        revealContact: data.revealContact,
      },
    });
    return NextResponse.json({ ok: true, plot: serializeForOwner(created) });
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
  // Optional: a hint about which city/suburb to scope the
  // market lookup to. If not provided AND we have a questionId,
  // we extract the city from the question text.
  const cityParam = url.searchParams.get("city") || null;
  const suburbParam = url.searchParams.get("suburb") || null;

  try {
    let ownerRows: any[];
    let cityFilter: string | null = cityParam;
    let suburbFilter: string | null = suburbParam;

    if (questionId) {
      // Verify ownership of the question first.
      const q = await prisma.question.findFirst({
        where: { id: questionId, userId },
        select: { id: true, vertical: true, questionText: true },
      });
      if (!q) {
        return NextResponse.json(
          { error: "questionId not found or not yours" },
          { status: 404 }
        );
      }
      // 1. Owner's own plots (always full data).
      ownerRows = await prisma.plot.findMany({
        where: { userId, questionId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      // 2. If no explicit city hint, extract the city from the
      // question text using the same detectCity helper the
      // models use. This gives us a "Sandton" -> "Sandton"
      // match even though the user's prompt was free-form.
      if (!cityFilter) {
        const detected: City | null = detectCity(q.questionText ?? "");
        if (detected) {
          cityFilter = detected.name;
        }
      }
    } else {
      ownerRows = await prisma.plot.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }

    // 3. Cross-user market: other users' PUBLISHED plots in the
    // same city (and suburb if we have one). Privacy: hide
    // private fields (agent, sourceUrl, notes) unless the
    // owner explicitly set revealContact=true. We never
    // return other users' agentName unless they opted in.
    let marketRows: any[] = [];
    if (cityFilter) {
      const where: any = {
        publishToMarket: true,
        city: { equals: cityFilter, mode: "insensitive" },
        // EXCLUDE the current user's own plots from the
        // market lookup — they go in ownerRows.
        userId: { not: userId },
      };
      if (suburbFilter) {
        where.suburb = { equals: suburbFilter, mode: "insensitive" };
      }
      marketRows = await prisma.plot.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }

    return NextResponse.json({
      ok: true,
      // The owner always sees their own plots in full.
      owner: ownerRows.map(serializeForOwner),
      // Other users' plots, scoped to public fields based on
      // their privacy settings. We sort with owner's own
      // plots first, market second.
      market: marketRows.map(serializeForMarket),
      // Helpful for the UI: the city/suburb we scoped the
      // market lookup to. If null, the user's question
      // didn't mention a known city and we don't show
      // market listings.
      cityFilter,
      suburbFilter,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Serialise a Plot row for its OWNER. Returns everything,
 * including private fields (notes, sourceUrl, agentName) and
 * the privacy flags themselves (so the UI can render toggles
 * to update them).
 */
function serializeForOwner(p: any) {
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
    isPublic: p.isPublic ?? p.publishToMarket ?? false,
    publishToMarket: p.publishToMarket ?? false,
    revealContact: p.revealContact ?? false,
    questionId: p.questionId,
    // Marker for the UI to tell owner vs market rows apart
    // when both are in the same list.
    ownership: "owner" as const,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Serialise another user's PUBLISHED plot for the market view.
 * Strips private fields unless the owner explicitly opted in.
 *
 * The "data fields" (suburb, city, size, price, currency,
 * listing type, lat/lng) are always included when
 * publishToMarket=true. The "contact fields" (agentName,
 * sourceUrl) are only included when revealContact=true. The
 * `notes` field is NEVER included for other users — that's a
 * private field the owner keeps.
 */
function serializeForMarket(p: any) {
  const showContact = !!p.revealContact;
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
    // Contact fields — gated by revealContact.
    agentName: showContact ? p.agentName : null,
    sourceUrl: showContact ? p.sourceUrl : null,
    // We don't expose notes, source (manual/user), isPublic,
    // publishToMarket, revealContact, or questionId to
    // other users. The owner controls their privacy.
    // Anonymous "from the Atlas market" attribution.
    ownership: "market" as const,
    createdAt: p.createdAt,
  };
}

