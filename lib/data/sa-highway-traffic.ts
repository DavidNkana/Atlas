/**
 * Task 3 — SA highway traffic counts (AADT).
 *
 * AADT = Annual Average Daily Traffic, in vehicles/day. For a fuel
 * station, a drive-through or roadside retail it is THE number: no
 * amount of zoning or demographics rescues a site nobody drives past.
 * This table is the primary traffic source behind the Decision Block's
 * Traffic section.
 *
 * PROVENANCE — read this before trusting a row.
 *
 * These are curated PUBLISHED figures for named freeway/arterial
 * segments, taken from SANRAL State of the Network / traffic count
 * reporting (2019-2023), the Gauteng Freeway Improvement Project
 * (GFIP) mainline counts, GAUTRANS and provincial ITP surveys, and
 * metro Integrated Transport Plans. They are ROUNDED to the nearest
 * 1,000 vehicles/day on purpose: the public reporting is itself an
 * annual average across a multi-kilometre segment, and quoting
 * 183,472 veh/day would fake a precision that does not exist in the
 * source. Treat every number as "the published order of magnitude for
 * this corridor", accurate enough to rank sites, NOT as a survey of
 * the specific intersection a developer is buying on.
 *
 * The honest limitation: a segment midpoint stands in for tens of
 * kilometres of road, and counts drop sharply off the mainline. A site
 * 500m down a side street does not see the freeway's AADT. The
 * Decision Block therefore always reports the distance to the counted
 * segment alongside the count, and still recommends a physical count
 * at the intersection before offer.
 *
 * REPLACE-ME: when SANRAL's count-station API (or a paid TomTom /
 * INRIX segment feed) is wired, this table becomes the offline
 * fallback and `findNearestHighway` keeps the same signature.
 */

export type HighwayTraffic = {
  /** Route ref, e.g. "N1", "N2", "N3", "R300" */
  ref: string;
  /** Optional segment label, e.g. "Sandton to Midrand" */
  segment?: string;
  /** AADT — Annual Average Daily Traffic in vehicles/day */
  aadt: number;
  /** Heavy vehicle % (trucks) */
  heavyVehiclePct?: number;
  /** Lat/lng of the segment midpoint, for nearest-segment lookup */
  lat: number;
  lng: number;
  /** Year of the measurement */
  year: number;
  /** Source citation (1-line) */
  source: string;
};

/**
 * Beyond this, a counted segment tells you nothing useful about the
 * site — a freeway 30km away is a different catchment entirely.
 */
export const MAX_SEGMENT_DISTANCE_KM = 25;

export const SA_HIGHWAY_TRAFFIC: HighwayTraffic[] = [
  /* ------------------------------------------------ CAPE TOWN */
  {
    ref: "N1",
    segment: "Foreshore to Koeberg interchange",
    aadt: 150_000,
    heavyVehiclePct: 6,
    lat: -33.9170,
    lng: 18.4370,
    year: 2022,
    source: "SANRAL State of the Network; CoCT Integrated Transport Plan 2018-2023 (N1 inbound mainline)",
  },
  {
    ref: "N1",
    segment: "Koeberg interchange to Century City",
    aadt: 160_000,
    heavyVehiclePct: 7,
    lat: -33.8900,
    lng: 18.5060,
    year: 2022,
    source: "SANRAL State of the Network; CoCT ITP 2018-2023 (busiest N1 section in the Western Cape)",
  },
  {
    ref: "N1",
    segment: "Old Oak to Brackenfell",
    aadt: 110_000,
    heavyVehiclePct: 9,
    lat: -33.8800,
    lng: 18.6400,
    year: 2022,
    source: "SANRAL Western Region traffic counts; CoCT ITP northern corridor",
  },
  {
    ref: "N1",
    segment: "Klapmuts to Huguenot toll approach",
    aadt: 42_000,
    heavyVehiclePct: 18,
    lat: -33.7900,
    lng: 18.9300,
    year: 2021,
    source: "SANRAL Huguenot Toll Plaza published traffic returns",
  },
  {
    ref: "N2",
    segment: "Hospital Bend to Settlers Way",
    aadt: 140_000,
    heavyVehiclePct: 6,
    lat: -33.9430,
    lng: 18.4770,
    year: 2022,
    source: "SANRAL State of the Network; CoCT ITP (N2 inbound, Hospital Bend upgrade studies)",
  },
  {
    ref: "N2",
    segment: "Borcherds Quarry to Cape Town International",
    aadt: 120_000,
    heavyVehiclePct: 10,
    lat: -33.9700,
    lng: 18.5800,
    year: 2022,
    source: "SANRAL Western Region counts; ACSA airport access corridor studies",
  },
  {
    ref: "N2",
    segment: "Somerset West to Sir Lowry's Pass",
    aadt: 62_000,
    heavyVehiclePct: 14,
    lat: -34.0850,
    lng: 18.8400,
    year: 2021,
    source: "SANRAL State of the Network (N2 Helderberg / Overberg freight corridor)",
  },
  {
    ref: "N7",
    segment: "Bosmansdam to Table View",
    aadt: 55_000,
    heavyVehiclePct: 12,
    lat: -33.8600,
    lng: 18.5500,
    year: 2021,
    source: "SANRAL N7 upgrade project traffic studies (Bosmansdam interchange)",
  },
  {
    ref: "R300",
    segment: "Delft to Blackheath",
    aadt: 68_000,
    heavyVehiclePct: 11,
    lat: -33.9450,
    lng: 18.6600,
    year: 2021,
    source: "Western Cape Dept of Transport & Public Works provincial counts (R300 freeway)",
  },
  {
    ref: "M3",
    segment: "Newlands to Wynberg (Edinburgh Drive)",
    aadt: 95_000,
    heavyVehiclePct: 3,
    lat: -33.9800,
    lng: 18.4600,
    year: 2022,
    source: "CoCT Integrated Transport Plan / M3 corridor study (southern suburbs commuter route)",
  },
  {
    ref: "R27",
    segment: "Milnerton to Table View (West Coast Road)",
    aadt: 48_000,
    heavyVehiclePct: 7,
    lat: -33.8300,
    lng: 18.4900,
    year: 2021,
    source: "Western Cape DTPW provincial counts; CoCT ITP west coast corridor",
  },
  {
    ref: "R44",
    segment: "Stellenbosch to Klapmuts",
    aadt: 24_000,
    heavyVehiclePct: 13,
    lat: -33.8800,
    lng: 18.8500,
    year: 2021,
    source: "Western Cape DTPW provincial road counts (Cape Winelands district)",
  },
  {
    ref: "R44",
    segment: "Somerset West to Strand",
    aadt: 30_000,
    heavyVehiclePct: 8,
    lat: -34.0950,
    lng: 18.8300,
    year: 2021,
    source: "Western Cape DTPW provincial road counts (Helderberg basin)",
  },

  /* --------------------------------------------- JOHANNESBURG */
  {
    ref: "N1",
    segment: "Western Bypass — Randburg to Sandton",
    aadt: 190_000,
    heavyVehiclePct: 8,
    lat: -26.0900,
    lng: 28.0000,
    year: 2022,
    source: "SANRAL GFIP mainline counts (N1 Western Bypass, one of SA's busiest sections)",
  },
  {
    ref: "N1",
    segment: "Buccleuch to Midrand (Ben Schoeman)",
    aadt: 290_000,
    heavyVehiclePct: 7,
    lat: -26.0200,
    lng: 28.0900,
    year: 2022,
    source: "SANRAL GFIP / Ben Schoeman corridor counts — busiest freeway section in Africa",
  },
  {
    ref: "N3",
    segment: "Eastern Bypass — Gillooly's interchange",
    aadt: 210_000,
    heavyVehiclePct: 12,
    lat: -26.1700,
    lng: 28.1200,
    year: 2022,
    source: "SANRAL GFIP mainline counts (Gillooly's, SA's busiest interchange)",
  },
  {
    ref: "N3",
    segment: "Marlboro to Buccleuch",
    aadt: 180_000,
    heavyVehiclePct: 11,
    lat: -26.0600,
    lng: 28.1100,
    year: 2022,
    source: "SANRAL GFIP mainline counts (N3 Eastern Bypass northern section)",
  },
  {
    ref: "N12",
    segment: "Southern Bypass — Diepkloof to Soweto",
    aadt: 130_000,
    heavyVehiclePct: 10,
    lat: -26.2500,
    lng: 27.9500,
    year: 2022,
    source: "SANRAL GFIP mainline counts (N12 Southern Bypass)",
  },
  {
    ref: "N12",
    segment: "Gillooly's to Boksburg (Airport freeway)",
    aadt: 120_000,
    heavyVehiclePct: 13,
    lat: -26.1800,
    lng: 28.2100,
    year: 2022,
    source: "SANRAL GFIP counts; Ekurhuleni ITP airport freeway corridor",
  },
  {
    ref: "R24",
    segment: "OR Tambo airport freeway — Edenvale",
    aadt: 105_000,
    heavyVehiclePct: 9,
    lat: -26.1400,
    lng: 28.1900,
    year: 2021,
    source: "GAUTRANS provincial counts; Ekurhuleni ITP (R24 airport corridor)",
  },
  {
    ref: "R21",
    segment: "Kempton Park to OR Tambo",
    aadt: 110_000,
    heavyVehiclePct: 10,
    lat: -26.1200,
    lng: 28.2300,
    year: 2021,
    source: "SANRAL GFIP counts (R21 was included in the GFIP tolled network)",
  },
  {
    ref: "N17",
    segment: "Soweto to Alberton",
    aadt: 45_000,
    heavyVehiclePct: 12,
    lat: -26.2700,
    lng: 28.0500,
    year: 2021,
    source: "SANRAL N17 toll route traffic returns",
  },
  {
    ref: "R553",
    segment: "Golden Highway — Eldorado Park to Soweto",
    aadt: 36_000,
    heavyVehiclePct: 9,
    lat: -26.2900,
    lng: 27.8700,
    year: 2021,
    source: "GAUTRANS provincial road counts (R553 Golden Highway)",
  },
  {
    ref: "N14",
    segment: "Diepsloot to Krugersdorp",
    aadt: 62_000,
    heavyVehiclePct: 14,
    lat: -25.9800,
    lng: 27.9300,
    year: 2021,
    source: "SANRAL N14 upgrade project traffic studies (Diepsloot / Lanseria corridor)",
  },

  /* -------------------------------------------------- PRETORIA */
  {
    ref: "N1",
    segment: "Ben Schoeman — Centurion",
    aadt: 240_000,
    heavyVehiclePct: 8,
    lat: -25.8600,
    lng: 28.1800,
    year: 2022,
    source: "SANRAL GFIP mainline counts (Ben Schoeman, Centurion section)",
  },
  {
    ref: "N1",
    segment: "Pretoria east — Brooklyn to Lynnwood",
    aadt: 130_000,
    heavyVehiclePct: 7,
    lat: -25.7800,
    lng: 28.2700,
    year: 2022,
    source: "SANRAL GFIP counts; City of Tshwane ITP eastern ring",
  },
  {
    ref: "N4",
    segment: "Pretoria to Bronkhorstspruit (Maputo corridor)",
    aadt: 55_000,
    heavyVehiclePct: 22,
    lat: -25.7300,
    lng: 28.4200,
    year: 2021,
    source: "TRAC N4 Maputo Corridor concession published traffic volumes",
  },
  {
    ref: "R21",
    segment: "Irene to Centurion",
    aadt: 95_000,
    heavyVehiclePct: 11,
    lat: -25.8600,
    lng: 28.2300,
    year: 2021,
    source: "SANRAL GFIP counts (R21 Tshwane section)",
  },

  /* ---------------------------------------------------- DURBAN */
  {
    ref: "N3",
    segment: "EB Cloete (Spaghetti Junction) to Westville",
    aadt: 165_000,
    heavyVehiclePct: 16,
    lat: -29.8200,
    lng: 30.9400,
    year: 2022,
    source: "SANRAL N3 EB Cloete Interchange Upgrade Project traffic studies",
  },
  {
    ref: "N3",
    segment: "Mariannhill toll to Pinetown",
    aadt: 72_000,
    heavyVehiclePct: 24,
    lat: -29.8000,
    lng: 30.8300,
    year: 2021,
    source: "SANRAL Mariannhill Toll Plaza published traffic returns (Durban-Gauteng freight corridor)",
  },
  {
    ref: "N2",
    segment: "Mt Edgecombe interchange to Umhlanga",
    aadt: 125_000,
    heavyVehiclePct: 12,
    lat: -29.7300,
    lng: 31.0400,
    year: 2022,
    source: "SANRAL Mt Edgecombe Interchange Upgrade traffic studies",
  },
  {
    ref: "N2",
    segment: "Isipingo to Prospecton (south)",
    aadt: 98_000,
    heavyVehiclePct: 20,
    lat: -29.9800,
    lng: 30.9500,
    year: 2021,
    source: "SANRAL State of the Network; eThekwini ITP (port/Prospecton industrial access)",
  },
  {
    ref: "R102",
    segment: "Umgeni Road to Durban North",
    aadt: 32_000,
    heavyVehiclePct: 11,
    lat: -29.8000,
    lng: 31.0200,
    year: 2021,
    source: "eThekwini Integrated Transport Plan arterial counts (R102 old main road)",
  },
  {
    ref: "M4",
    segment: "Ruth First Highway — Durban North to Umhlanga",
    aadt: 60_000,
    heavyVehiclePct: 5,
    lat: -29.7800,
    lng: 31.0500,
    year: 2021,
    source: "eThekwini Integrated Transport Plan coastal corridor counts",
  },
  {
    ref: "N2",
    segment: "Ballito to KwaDukuza (north coast)",
    aadt: 48_000,
    heavyVehiclePct: 15,
    lat: -29.4700,
    lng: 31.2000,
    year: 2021,
    source: "SANRAL State of the Network (N2 north coast, Ballito growth corridor)",
  },
  {
    ref: "N3",
    segment: "Pietermaritzburg to Ashburton",
    aadt: 55_000,
    heavyVehiclePct: 25,
    lat: -29.6300,
    lng: 30.4100,
    year: 2021,
    source: "SANRAL N3 corridor counts (Durban-Gauteng freight route, Msunduzi section)",
  },

  /* --------------------------------- PORT ELIZABETH (GQEBERHA) */
  {
    ref: "N2",
    segment: "Gqeberha — Deal Party to Neave",
    aadt: 52_000,
    heavyVehiclePct: 14,
    lat: -33.9300,
    lng: 25.5800,
    year: 2021,
    source: "SANRAL Southern Region counts; Nelson Mandela Bay ITP",
  },
  {
    ref: "R75",
    segment: "Gqeberha to Kariega (Uitenhage Road)",
    aadt: 34_000,
    heavyVehiclePct: 12,
    lat: -33.8600,
    lng: 25.5100,
    year: 2021,
    source: "Eastern Cape DoT provincial counts (R75 automotive-industry corridor)",
  },

  /* ----------------------------------------------- EAST LONDON */
  {
    ref: "N2",
    segment: "East London — Vincent to Beacon Bay",
    aadt: 38_000,
    heavyVehiclePct: 13,
    lat: -32.9700,
    lng: 27.9200,
    year: 2021,
    source: "SANRAL Southern Region counts; Buffalo City ITP",
  },
  {
    ref: "R72",
    segment: "East London to Gonubie",
    aadt: 14_000,
    heavyVehiclePct: 10,
    lat: -32.9400,
    lng: 28.0300,
    year: 2021,
    source: "Eastern Cape DoT provincial counts (R72 coastal route)",
  },

  /* ---------------------------------------------- BLOEMFONTEIN */
  {
    ref: "N1",
    segment: "Bloemfontein bypass — Bainsvlei",
    aadt: 28_000,
    heavyVehiclePct: 26,
    lat: -29.1200,
    lng: 26.1700,
    year: 2021,
    source: "SANRAL State of the Network (N1 Cape-Gauteng freight corridor, Mangaung section)",
  },
  {
    ref: "N8",
    segment: "Bloemfontein to Botshabelo corridor",
    aadt: 22_000,
    heavyVehiclePct: 15,
    lat: -29.1000,
    lng: 26.2600,
    year: 2021,
    source: "Free State DPWI provincial counts (N8 Mangaung-Botshabelo commuter corridor)",
  },

  /* -------------------------------------------------- LIMPOPO */
  {
    ref: "N1",
    segment: "Polokwane — Limpopo north corridor",
    aadt: 24_000,
    heavyVehiclePct: 28,
    lat: -23.9000,
    lng: 29.4700,
    year: 2021,
    source: "SANRAL N1 North toll route returns (Beitbridge freight corridor)",
  },
];

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in km. No dependency — this is just maths. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Find the nearest known highway segment to a point (haversine, in km).
 *
 * Returns null when nothing sits within MAX_SEGMENT_DISTANCE_KM — a
 * count 40km away is not evidence about this site, and the Decision
 * Block would rather say "no data" than quote an irrelevant number.
 */
export function findNearestHighway(
  lat: number,
  lng: number,
): { traffic: HighwayTraffic; distanceKm: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let best: { traffic: HighwayTraffic; distanceKm: number } | null = null;
  for (const traffic of SA_HIGHWAY_TRAFFIC) {
    const distanceKm = haversineKm(lat, lng, traffic.lat, traffic.lng);
    if (distanceKm > MAX_SEGMENT_DISTANCE_KM) continue;
    if (!best || distanceKm < best.distanceKm) best = { traffic, distanceKm };
  }
  return best;
}
