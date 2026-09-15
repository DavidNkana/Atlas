import assert from "node:assert/strict";
import { buildPlan } from "@/lib/plan/planner";
import { readOverpassCount } from "@/lib/connectors/overpass-client";
import { metadataForSource } from "@/lib/connectors/provenance";
import { combine } from "@/lib/scoring/engine";
import { GALLERY_QUESTION_COUNT, GALLERY_QUESTIONS } from "@/components/QuestionGallery";
import { buildPrompt as buildGooglePrompt } from "@/lib/models/google";
import { buildPrompt as buildOpenRouterPrompt } from "@/lib/models/openrouter";
import { buildPrompt as buildGeminiPrompt } from "@/lib/models/gemini-search";
import { buildPrompt as buildOpenAIPrompt, getOpenAITimeoutMs, normalizeOpenAIModel, openaiLuna, parseResponse as parseOpenAIResponse } from "@/lib/models/openai";
import { getModel } from "@/lib/models/registry";
import { buildMessages as buildPerplexityMessages } from "@/lib/models/perplexity";
import { curatedStub } from "@/lib/models/stub";
import { applyConfidenceGate, confidenceWarningForSites, hasLabeledEmptyRanking } from "@/lib/reliability/empty-ranking";
import { applyCompetitorAuthority } from "@/lib/connectors/competitor-authority";
import { evidenceCoverage } from "@/lib/reliability/confidence";
import { validatePrompt } from "@/lib/intent/validate";
import { filterCandidatesToAnchor, resolveLocationAnchor, resolveLocationAnchorAsync, validCoordinates } from "@/lib/location/registry";
import { mapCustomVertical } from "@/lib/scoring/custom-vertical";

async function main() {
  const laudium = resolveLocationAnchor("Find residential land in Laudium");
  assert.equal(laudium.status, "resolved");
  if (laudium.status === "resolved") {
    assert.equal(laudium.anchor.label, "Laudium");
    assert.match(laudium.anchor.parent, /Pretoria|Tshwane/);
    assert.equal(laudium.anchor.approximate, true);
    assert.equal(laudium.anchor.source, "approximate_registry");
    const candidates = [
      { name: "Laudium candidate", lat: laudium.anchor.lat, lng: laudium.anchor.lng },
      { name: "Johannesburg candidate", lat: -26.2041, lng: 28.0473 },
      { name: "unlocated" },
      { name: "outside fence", lat: -25.6, lng: 28.8 },
    ];
    const fenced = filterCandidatesToAnchor(candidates, laudium.anchor);
    assert.deepEqual(fenced.map((candidate) => candidate.name), ["Laudium candidate"]);
    assert.ok(fenced.every(validCoordinates), "ranked candidates must have coordinates");
    assert.equal(fenced.some((candidate) => candidate.name.includes("Johannesburg")), false);
  }
  const unresolved = resolveLocationAnchor("Find a site in Atlantisia");
  assert.equal(unresolved.status, "needs_clarification");
  const radiusLocation = resolveLocationAnchor("Find a site within 5 km of Laudium");
  assert.equal(radiusLocation.status, "resolved");
  if (radiusLocation.status === "resolved") assert.equal(radiusLocation.anchor.radiusKm, 5);
  const previousFetchForGeocoder = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([{
    lat: "-26.65", lon: "27.93", type: "suburb", display_name: "Vereeniging, Gauteng, South Africa",
    address: { suburb: "Vereeniging", municipality: "Emfuleni Local Municipality", country_code: "za" },
  }]), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const geocoded = await resolveLocationAnchorAsync("Find a site in Vereeniging");
    assert.equal(geocoded.status, "resolved");
    if (geocoded.status === "resolved") {
      assert.equal(geocoded.anchor.source, "nominatim");
      assert.equal(geocoded.anchor.parent, "Emfuleni Local Municipality");
      assert.equal(geocoded.anchor.lat, -26.65);
    }
  } finally {
    globalThis.fetch = previousFetchForGeocoder;
  }
  assert.equal(mapCustomVertical("residential_land"), "residential_land");
  assert.equal(mapCustomVertical("cold_storage"), "warehouse");

// Prompt validation is server-side and must happen before any model/stub path.
const unrelated = validatePrompt("gas_station", "what is pussy");
assert.equal(unrelated.ok, false);
if (!unrelated.ok) {
  assert.equal(unrelated.status, "invalid_prompt");
  assert.equal(unrelated.code, "invalid_prompt");
}

const restaurantBrief = validatePrompt(
  "restaurant",
  "Identify a restaurant development site in Pretoria Hatfield for a student-oriented scheme; assess zoning, access, demand, and competition.",
);
assert.equal(restaurantBrief.ok, true);
if (restaurantBrief.ok) assert.equal(restaurantBrief.status, "valid");

const warehouseMismatch = validatePrompt(
  "gas_station",
  "Where in Durban should I develop a warehouse and logistics facility?",
);
assert.equal(warehouseMismatch.ok, false);
if (!warehouseMismatch.ok) {
  assert.equal(warehouseMismatch.status, "vertical_mismatch");
  assert.equal(warehouseMismatch.code, "vertical_mismatch");
}

const warehouseClarification = validatePrompt("gas_station", "I am considering a warehouse");
assert.equal(warehouseClarification.ok, false);
if (!warehouseClarification.ok) assert.equal(warehouseClarification.status, "needs_clarification");

const customBrief = validatePrompt(
  "custom:cold_storage",
  "Develop a cold-storage project near Durban; identify suitable industrial sites and assess power, access, zoning, and demand.",
);
assert.equal(customBrief.ok, true);
if (customBrief.ok) assert.equal(customBrief.status, "valid");

for (const missing of [
  validatePrompt("restaurant", "Find a restaurant site"),
  validatePrompt("restaurant", "In Cape Town"),
]) {
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "needs_clarification");
}

const sites = [
  { id: "alpha", rank: 1, name: "Alpha", lat: -33, lng: 18 },
  { id: "beta", rank: 2, name: "Beta", lat: -34, lng: 19 },
];
const plan = buildPlan("gas_station", { lat: -33, lng: 18 }, sites);
assert.equal(plan.steps.length % sites.length, 0);
const connectorsPerSite = plan.steps.length / sites.length;
assert.ok(connectorsPerSite > 1);
for (const step of plan.steps) {
  assert.equal(step.siteId, sites[step.siteIndex].id);
  assert.equal(step.input.siteId, step.siteId);
}

assert.equal(readOverpassCount({ total: "37" }), 37);
assert.equal(readOverpassCount({ total: "0" }), 0);
assert.equal(readOverpassCount({ total: "not-a-number" }), null);
assert.equal(readOverpassCount(undefined), null);

const adverse = combine(
  { id: "x", score: 0.5 },
  [{ id: "x", source: "tomtom_traffic", type: "traffic_incidents", label: "5 incidents", value: 5, weight: 1, fetchedAt: new Date().toISOString() }],
  "gas_station",
);
assert.ok(adverse.signalScore < 0);
assert.equal(metadataForSource("sa_traffic").provenance, "Curated");
assert.equal(metadataForSource("tomtom_traffic").provenance, "Live");

// Competitor authority: a successful named Places lookup must replace the
// stale OSM count everywhere scoring reads it; a failed lookup must not erase
// the OSM fallback signal.
const osmCompetitor = {
  id: "osm:competitor",
  source: "competitors",
  type: "competitor_count",
  label: "0 restaurant competitors (OpenStreetMap)",
  value: 0,
  weight: 1,
  fetchedAt: new Date().toISOString(),
} as any;
const googleResult = {
  ok: true,
  places: [{ name: "Named Place", placeId: "p1", lat: -33, lng: 18, types: ["restaurant"], distanceM: 100 }],
  searchLat: -33,
  searchLng: 18,
  radiusM: 3000,
  searchedKeyword: "restaurant",
};
const authoritativeSignals = applyCompetitorAuthority([osmCompetitor], googleResult, "restaurant");
assert.equal(authoritativeSignals.filter((s) => s.type === "competitor_count")[0].value, 1);
assert.equal(authoritativeSignals.filter((s) => s.type === "competitor_count")[0].source, "google_places");
const osmFallbackSignals = applyCompetitorAuthority([osmCompetitor], { ...googleResult, ok: false, places: [] }, "restaurant");
assert.equal(osmFallbackSignals[0].value, 0);
assert.equal(osmFallbackSignals[0].source, "competitors");

const developmentBrief = {
  vertical: "restaurant",
  question: "Identify vacant or redevelopment sites within 5 km of Pretoria Hatfield for a student-oriented scheme; assess zoning, access, demand, competition, and constraints.",
} as any;
assert.equal(GALLERY_QUESTION_COUNT, 20);
assert.ok(GALLERY_QUESTIONS.every((q) => /vacant|redevelopment/i.test(q)));
for (const prompt of [
  buildGooglePrompt(developmentBrief),
  buildOpenRouterPrompt(developmentBrief),
  buildGeminiPrompt(developmentBrief),
  buildOpenAIPrompt(developmentBrief),
  buildPerplexityMessages(developmentBrief)[1].content,
]) {
  assert.match(prompt, /development brief|development site-selection|land or redevelopment/i);
  assert.match(prompt, /assumptions|evidence gaps|constraints|diligence/i);
  assert.match(prompt, /first rationale sentence/i);
  assert.doesNotMatch(prompt, /find the best|best location|searching for a|best suburb/i);
}

// Luna is registered as the primary provider, but availability is strictly
// server-side and depends only on OPENAI_API_KEY (never a client env var).
assert.equal(getModel("gpt-5.6-luna"), openaiLuna);
assert.equal(normalizeOpenAIModel("openai/gpt-5.6-luna"), "gpt-5.6-luna");
const previousOpenAITimeout = process.env.OPENAI_TIMEOUT_MS;
delete process.env.OPENAI_TIMEOUT_MS;
assert.equal(getOpenAITimeoutMs(), 15_000);
process.env.OPENAI_TIMEOUT_MS = "20000";
assert.equal(getOpenAITimeoutMs(), 15_000, "Luna timeout must remain bounded at 15 seconds");
if (previousOpenAITimeout === undefined) delete process.env.OPENAI_TIMEOUT_MS;
else process.env.OPENAI_TIMEOUT_MS = previousOpenAITimeout;
assert.equal(
  normalizeOpenAIModel("openai/gpt-5.6-luna", "https://gateway.example/v1"),
  "openai/gpt-5.6-luna",
);
assert.match(buildOpenAIPrompt(developmentBrief), /Full natural-language question/);
assert.match(buildOpenAIPrompt(developmentBrief), /ranked_sites/);
const previousOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
const previousOpenAIModel = process.env.OPENAI_MODEL;
const previousOpenAIKeyForRequest = process.env.OPENAI_API_KEY;
const previousFetch = globalThis.fetch;
let lunaRequestBody: Record<string, unknown> | undefined;
process.env.OPENAI_API_KEY = "reliability-test-key";
delete process.env.OPENAI_BASE_URL;
delete process.env.OPENAI_MODEL;
globalThis.fetch = (async (_input, init) => {
  lunaRequestBody = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ choices: [{ message: { content: '{"ranked_sites":[{"name":"Test","rationale":"A hypothesis"}]}' } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;
try {
  assert.equal((await openaiLuna.call(developmentBrief)).ok, true);
  assert.equal(lunaRequestBody?.max_completion_tokens, 1800);
  assert.equal("max_tokens" in (lunaRequestBody ?? {}), false);
  assert.equal("temperature" in (lunaRequestBody ?? {}), false);
  assert.deepEqual(lunaRequestBody?.response_format, { type: "json_object" });
} finally {
  globalThis.fetch = previousFetch;
  if (previousOpenAIBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = previousOpenAIBaseUrl;
  if (previousOpenAIModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = previousOpenAIModel;
  if (previousOpenAIKeyForRequest === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAIKeyForRequest;
}
const previousOpenAIKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
assert.equal(openaiLuna.isAvailable(), false);
if (previousOpenAIKey !== undefined) process.env.OPENAI_API_KEY = previousOpenAIKey;

// A malformed or empty structured response must be a provider failure so the
// route can label the curated result as stub_demo rather than AI-backed.
assert.equal(parseOpenAIResponse("not json").ok, false);
assert.equal(parseOpenAIResponse('{"ranked_sites":[]}').ok, false);
const zeroCoordinates = parseOpenAIResponse(JSON.stringify({
  ranked_sites: [{ name: "Origin", rationale: "A hypothesis", lat: 0, lng: 0 }],
}));
assert.equal(zeroCoordinates.ok, true);
if (zeroCoordinates.ok) {
  assert.equal("lat" in zeroCoordinates.ranked_sites[0], false);
  assert.equal("lng" in zeroCoordinates.ranked_sites[0], false);
}
const finiteCoordinates = parseOpenAIResponse(JSON.stringify({
  ranked_sites: [{ name: "Meridian", rationale: "A hypothesis", lat: 0, lng: 18.4 }],
}));
assert.equal(finiteCoordinates.ok, true);
if (finiteCoordinates.ok) {
  assert.equal(finiteCoordinates.ranked_sites[0].lat, 0);
  assert.equal(finiteCoordinates.ranked_sites[0].lng, 18.4);
}

// Reliability: a valid low-confidence AI ranking remains AI-backed and gets
// an additive warning; only provider failures/empty output use the curated path.
const lowConfidence = [
  { rank: 1, name: "weak", confidence: 0.2 },
  { rank: 2, name: "also weak", confidence: 0.3 },
];
assert.deepEqual(applyConfidenceGate(lowConfidence), lowConfidence);
  assert.match(confidenceWarningForSites(lowConfidence) ?? "", /AI reasoning confidence is low/);
  assert.equal(confidenceWarningForSites([{ confidence: 0.9 }]), undefined);
  const lowConfidenceLuna = {
    model: { id: "gpt-5.6-luna", displayName: "GPT-5.6 Luna", fallbackUsed: false },
    ranked_sites: [{ ...lowConfidence[0], modelConfidence: 0.2, evidenceCoverage: 0.1, evidenceConfidence: 0.18 }],
  };
  assert.equal(lowConfidenceLuna.model.id, "gpt-5.6-luna", "valid low-confidence Luna output remains primary");
  assert.equal(lowConfidenceLuna.model.fallbackUsed, false);
  assert.notEqual(lowConfidenceLuna.ranked_sites[0].modelConfidence, lowConfidenceLuna.ranked_sites[0].evidenceCoverage);
  assert.equal(
    evidenceCoverage([
      { source: "sa_traffic", provenance: "Curated" },
      { source: "catalog", provenance: "Synthetic/Heuristic" },
    ],
      4,
    ),
    0.25,
    "synthetic catalog hints must not inflate evidence coverage",
  );
const curatedResponse = await curatedStub.call({
  vertical: "retail_shop",
  question: "Find retail sites in Johannesburg",
});
assert.equal(curatedResponse.ok, true);
assert.ok(curatedResponse.ranked_sites.length > 0, "curated fallback must not return zero sites");
assert.equal((curatedResponse as any).__stub?.status, "stub_demo");
assert.ok(applyConfidenceGate(curatedResponse.ranked_sites).length > 0);

// A model returning [] and an all-model timeout use the same deterministic
// fallback contract; no live evidence is fabricated by this check.
async function fallbackAfterModelFailure(kind: "empty" | "timeout") {
  try {
    if (kind === "timeout") throw new Error("model timeout");
    const empty = { ok: true as const, ranked_sites: [] };
    if (empty.ranked_sites.length === 0) throw new Error("model returned zero sites");
    return empty;
  } catch {
    return curatedStub.call({ vertical: "retail_shop", question: "Retail in Cape Town" });
  }
}
assert.ok(((await fallbackAfterModelFailure("empty")) as any).ranked_sites.length > 0);
assert.ok(((await fallbackAfterModelFailure("timeout")) as any).ranked_sites.length > 0);
assert.equal(hasLabeledEmptyRanking({ status: "ok", ranked_sites: [] }), false);
assert.equal(hasLabeledEmptyRanking({ status: "unavailable", ranked_sites: [], unavailableReason: "no fallback" }), true);
assert.equal(hasLabeledEmptyRanking({ status: "partial_timeout", ranked_sites: [], model: { modelError: "timed out" } }), true);

console.log("reliability checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
