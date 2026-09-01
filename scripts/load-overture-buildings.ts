/**
 * One-off loader: aggregate Overture Maps `buildings` theme for South
 * Africa into per-suburb counts that lib/data/sa-building-density.ts
 * can read at runtime.
 *
 * Why pre-compute: Overture's SA building dataset is ~150k polygons
 * for a 2km radius. Vercel's 50MB function limit rules out loading
 * the raw GeoJSON at runtime. We pre-aggregate to per-suburb counts
 * and ship a compact JSON lookup.
 *
 * How to run:
 *   1. Install DuckDB locally (no Docker, no Python):
 *        brew install duckdb   # macOS
 *        apt-get install duckdb  # Ubuntu
 *
 *   2. Run this script:
 *        pnpm tsx scripts/load-overture-buildings.ts
 *      (the script will invoke DuckDB via the `duckdb` CLI and read
 *      the SA slice from the Overture S3 bucket directly).
 *
 *   3. The script writes the result to
 *        lib/data/sa-building-density.json
 *      which the connector imports at runtime.
 *
 * Output shape: matches sa-building-density.ts.
 *
 * If DuckDB isn't installed, the script prints the exact CLI command
 * to run manually and exits.
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// SA bounding box (rough): covers the three major metros + buffer.
// lng_min, lat_min, lng_max, lat_max
const SA_BBOX = {
  lngMin: 16.0,
  latMin: -35.0,
  lngMax: 33.0,
  latMax: -22.0,
};

// SA suburb centroids we want to pre-aggregate against.
// Pulled from the existing sa-building-density.ts entries so the
// schema stays consistent across both the live and seeded paths.
import { SA_BUILDING_DENSITY } from "../lib/data/sa-building-density";

interface BuildingRow {
  lat: number;
  lng: number;
}

const DUCKDB_QUERY = `
INSTALL spatial;
LOAD spatial;
LOAD httpfs;
SET s3_region = 'us-west-2';

COPY (
  WITH buildings AS (
    SELECT
      bbox.xmin AS xmin,
      bbox.ymin AS ymin,
      bbox.xmax AS xmax,
      bbox.ymax AS ymax,
      ST_GeomFromText(
        'POLYGON((' ||
          bbox.xmin || ' ' || bbox.ymin || ',' ||
          bbox.xmax || ' ' || bbox.ymin || ',' ||
          bbox.xmax || ' ' || bbox.ymax || ',' ||
          bbox.xmin || ' ' || bbox.ymax || ',' ||
          bbox.xmin || ' ' || bbox.ymin || '))'
      ) AS bbox_geom
    FROM read_parquet(
      's3://overturemaps-us-west-2/release/2026-08-19.0/theme=buildings/type=building/*',
      filename=true, hive_partitioning=1
    )
    WHERE bbox.xmin BETWEEN ${SA_BBOX.lngMin} AND ${SA_BBOX.lngMax}
      AND bbox.ymin BETWEEN ${SA_BBOX.latMin} AND ${SA_BBOX.latMax}
  ),
  centroids AS (
    SELECT
      suburb,
      lat AS c_lat,
      lng AS c_lng
    FROM read_csv_auto('/dev/stdin')
  )
  SELECT
    c.suburb,
    c.c_lat AS lat,
    c.c_lng AS lng,
    COUNT(*) AS building_count
  FROM centroids c
  LEFT JOIN buildings b
    ON ST_Contains(
      ST_Buffer(
        ST_GeomFromText('POINT(' || c.c_lng || ' ' || c.c_lat || ')'),
        0.018  -- ~2km at SA latitudes
      ),
      b.bbox_geom
    )
  GROUP BY c.suburb, c.c_lat, c.c_lng
)
TO '/tmp/overture_counts.csv' (FORMAT CSV, HEADER);
`;

async function main() {
  console.log("=== load-overture-buildings.ts ===");
  console.log(
    `Aggregating Overture SA building counts for ${SA_BUILDING_DENSITY.length} suburb centroids...`
  );
  console.log("");

  // Build the centroid CSV input for DuckDB.
  const centroidCsv = SA_BUILDING_DENSITY.map(
    (e) => `${e.suburb},${e.lat},${e.lng}`,
  ).join("\n");

  // Try to run DuckDB.
  let hasDuckdb = false;
  try {
    execSync("duckdb --version", { stdio: "pipe" });
    hasDuckdb = true;
  } catch {
    hasDuckdb = false;
  }

  if (!hasDuckdb) {
    console.error(
      "DuckDB not installed. Install it with one of:\n" +
        "  brew install duckdb       (macOS)\n" +
        "  apt-get install duckdb    (Ubuntu)\n" +
        "  choco install duckdb      (Windows)\n" +
        "Or download from https://duckdb.org/docs/installation/",
    );
    console.error("");
    console.error("Once installed, re-run this script:");
    console.error("  pnpm tsx scripts/load-overture-buildings.ts");
    process.exit(1);
  }

  console.log("DuckDB detected. Querying Overture S3...");
  console.log("");

  // Write centroid input to a temp file.
  const inputPath = "/tmp/atlas_centroids.csv";
  writeFileSync(inputPath, "suburb,lat,lng\n" + centroidCsv);

  // Build the query using the temp file path.
  const fullQuery = DUCKDB_QUERY.replace(
    "FROM read_csv_auto('/dev/stdin')",
    `FROM read_csv_auto('${inputPath}')`,
  );

  // Run DuckDB.
  try {
    execSync(`duckdb -c "${fullQuery.replace(/"/g, '\\"')}"`, {
      stdio: "inherit",
    });
  } catch (e) {
    console.error("DuckDB query failed. See error above.");
    process.exit(1);
  }

  // Parse the output CSV.
  const { readFileSync } = await import("fs");
  const csv = readFileSync("/tmp/overture_counts.csv", "utf-8");
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const suburbIdx = header.indexOf("suburb");
  const latIdx = header.indexOf("lat");
  const lngIdx = header.indexOf("lng");
  const countIdx = header.indexOf("building_count");

  const fetchedAt = new Date().toISOString().slice(0, 10);
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      suburb: cols[suburbIdx],
      lat: parseFloat(cols[latIdx]),
      lng: parseFloat(cols[lngIdx]),
      count: parseInt(cols[countIdx], 10),
      fetchedAt,
    };
  });

  console.log("");
  console.log(`Got real counts for ${rows.length} suburbs.`);
  console.log("Sample:");
  rows.slice(0, 5).forEach((r) => {
    console.log(`  ${r.suburb}: ${r.count.toLocaleString()} buildings`);
  });

  // Write the JSON file in the same shape as sa-building-density.ts.
  const out = `/**
 * AUTO-GENERATED by scripts/load-overture-buildings.ts on ${fetchedAt}.
 *
 * Source: Overture Maps \`buildings\` theme (2026-08-19.0 release).
 *
 * Each entry is the count of building polygons whose 2km buffer
 * around the suburb centroid intersects them. Used by the
 * building_density connector as a real (not seeded) value.
 *
 * Regenerate with: pnpm tsx scripts/load-overture-buildings.ts
 */
export interface BuildingDensityEntry {
  suburb: string;
  lat: number;
  lng: number;
  count: number;
  fetchedAt: string;
}

export const SA_BUILDING_DENSITY: BuildingDensityEntry[] = ${JSON.stringify(
    rows,
    null,
    2,
  )};

/** Distance in degrees (haversine approximation for small distances). */
function distDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return Math.sqrt(
    Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2),
  );
}

/**
 * Look up the building density for the suburb closest to the given
 * lat/lng. Returns null if no suburb is within 0.2° (~20km).
 */
export function findBuildingDensity(
  lat: number,
  lng: number,
): BuildingDensityEntry | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: BuildingDensityEntry | null = null;
  let bestD = Infinity;
  for (const entry of SA_BUILDING_DENSITY) {
    const d = distDeg(lat, lng, entry.lat, entry.lng);
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  if (best && bestD < 0.2) return best;
  return null;
}
`;

  const outPath = join(__dirname, "../lib/data/sa-building-density.ts");
  writeFileSync(outPath, out, "utf-8");
  console.log("");
  console.log(`Written to: ${outPath}`);
  console.log("");
  console.log("Next: commit the file and push to deploy.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
