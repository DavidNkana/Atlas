import { detectCity } from "../lib/stub/detect";
import { REAL_SITE_CATALOG } from "../lib/stub/real-sites";

const question = "Where in Constantia for luxury residential?";
const city = detectCity(question);
console.log("City:", city.name, city.id);

const sites = REAL_SITE_CATALOG[city.id]?.residential_land;
console.log("Found residential sites:", sites?.length || 0);
if (sites) {
  sites.slice(0, 5).forEach((s: any) => console.log(`  - ${s.name} (${s.suburb})`));
}
