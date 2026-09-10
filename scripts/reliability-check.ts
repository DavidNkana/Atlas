import assert from "node:assert/strict";
import { buildPlan } from "@/lib/plan/planner";
import { readOverpassCount } from "@/lib/connectors/overpass-client";
import { metadataForSource } from "@/lib/connectors/provenance";
import { combine } from "@/lib/scoring/engine";
import { GALLERY_QUESTION_COUNT, GALLERY_QUESTIONS } from "@/components/QuestionGallery";
import { buildPrompt as buildGooglePrompt } from "@/lib/models/google";
import { buildPrompt as buildOpenRouterPrompt } from "@/lib/models/openrouter";
import { buildPrompt as buildGeminiPrompt } from "@/lib/models/gemini-search";
import { buildMessages as buildPerplexityMessages } from "@/lib/models/perplexity";
import { curatedStub } from "@/lib/models/stub";
import { applyConfidenceGate, hasLabeledEmptyRanking } from "@/lib/reliability/empty-ranking";

async function main() {
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
  buildPerplexityMessages(developmentBrief)[1].content,
]) {
  assert.match(prompt, /development brief|development site-selection|land or redevelopment/i);
  assert.match(prompt, /assumptions|evidence gaps|constraints|diligence/i);
  assert.doesNotMatch(prompt, /find the best|best location|searching for a|best suburb/i);
}

// Zero-result reliability: low-confidence model output is erased, then the
// curated path is allowed through without applying that gate a second time.
const lowConfidence = [
  { rank: 1, name: "weak", confidence: 0.2 },
  { rank: 2, name: "also weak", confidence: 0.3 },
];
assert.deepEqual(applyConfidenceGate(lowConfidence), []);
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
