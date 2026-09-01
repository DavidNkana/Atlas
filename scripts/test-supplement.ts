import { REAL_SITE_CATALOG } from "../lib/stub/real-sites";
import { supplementMissingCatalogSites } from "../lib/stub/enrich-sites";

// Simulate what stub.ts does — set confidence on each site
const rawSites = REAL_SITE_CATALOG.cape_town?.residential_land ?? [];
const sites = rawSites.map((r: any, i: number) => ({
  rank: i + 1,
  name: r.name,
  lat: r.lat,
  lng: r.lng,
  score: +(0.92 - i * 0.05).toFixed(2),
  confidence: +(0.88 - i * 0.04).toFixed(2),
  rationale: r.rationale,
  signals: [],
}));
console.log("Before supplement:", sites.length);
console.log("First confidence:", sites[0].confidence);

const supp = supplementMissingCatalogSites(sites, "cape_town", "residential_land");
console.log("After supplement:", supp.length);
console.log("Supplement tagged:", supp.filter((s: any) => s._catalogSupplement).length);
console.log("First 5 confidences:", supp.slice(0, 5).map((s: any) => s.confidence));
