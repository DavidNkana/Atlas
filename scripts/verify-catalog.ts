import { REAL_SITE_CATALOG, getRealSiteCandidates } from "../lib/stub/real-sites";

const cities = Object.keys(REAL_SITE_CATALOG);
console.log("Cities in catalog:", cities);
console.log();
for (const city of ["cape_town", "sandton", "johannesburg", "durban", "pretoria", "midrand"]) {
  const byVertical: Record<string, number> = {};
  const verticals = ["gas_station", "restaurant", "warehouse", "retail_shop", "residential_land"];
  for (const v of verticals) {
    const sites = REAL_SITE_CATALOG[city]?.[v];
    byVertical[v] = sites?.length ?? 0;
  }
  console.log(`${city}:`, JSON.stringify(byVertical));
}

console.log();
console.log("Cape Town residential_land sites:");
const ctRes = getRealSiteCandidates("cape_town", "residential_land");
ctRes?.slice(0, 5).forEach((s: any) => console.log(`  - ${s.name} (${s.suburb})`));
