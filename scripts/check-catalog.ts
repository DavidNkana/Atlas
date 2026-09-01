import { REAL_SITE_CATALOG } from "../lib/stub/real-sites";
const res = REAL_SITE_CATALOG.cape_town?.residential_land;
console.log("Cape Town residential_land count:", res?.length);
console.log("First entry:", JSON.stringify(res?.[0]));
console.log("Catalog keys:", Object.keys(REAL_SITE_CATALOG));
console.log("Cape Town verticals:", Object.keys(REAL_SITE_CATALOG.cape_town || {}));
