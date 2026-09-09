import assert from "node:assert/strict";
import { buildPlan } from "@/lib/plan/planner";
import { readOverpassCount } from "@/lib/connectors/overpass-client";
import { metadataForSource } from "@/lib/connectors/provenance";
import { combine } from "@/lib/scoring/engine";

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

console.log("reliability checks passed");
