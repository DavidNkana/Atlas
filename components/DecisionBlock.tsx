"use client";

/**
 * Atlas — Decision Block.
 *
 * The per-site answer to the question a real SA property developer
 * actually asks: "can I legally, commercially and financially build
 * there?"
 *
 * Five sections, always rendered:
 *
 *   1. Zoning     — legal right to build (+ environmental constraints)
 *   2. Traffic    — will anyone drive past it
 *   3. Catchment  — who lives within reach and what they earn
 *   4. Economics  — what it costs to deploy and when it pays back
 *   5. Risks      — what could kill the deal
 *
 * THE RULE: the block never renders empty. Where Atlas has real data
 * it shows it in normal text. Where Atlas does NOT have the data it
 * says so explicitly, in amber, and tells the developer exactly which
 * office/portal/professional to go get it from. "Atlas is missing X —
 * here's what you check yourself" beats a blank panel every time, and
 * it is the honest version of "Decision Intelligence".
 *
 * Everything here is derived from data the site already carries
 * (catalog enrichment + connector signals). This component adds no
 * new data sources of its own.
 *
 * Task 3 — the three primary sources promised in that later pass have
 * now landed, and exactly as designed the manual-check callouts they
 * replace simply stopped rendering:
 *   - Zoning    ← sa_zoning connector (CoCT / CoJ / eThekwini schemes)
 *   - Traffic   ← sa_traffic connector (SANRAL / provincial AADT)
 *   - Economics ← live Property24 + Private Property land prices
 * Each still carries its own confirm-with-the-authority caveat,
 * because screening data is not a zoning certificate, a segment
 * average is not a count at your intersection, and an asking price is
 * not a deeds transaction.
 */

import { getEconomics, formatZAR, projectPayback } from "@/lib/decision/economics";

type DecisionSignal = {
  source: string;
  type: string;
  label: string;
  value: number;
  weight: number;
  /** Structured metadata — sa_zoning and sa_traffic both use it. */
  payload?: Record<string, unknown>;
};

export type DecisionBlockProps = {
  site: {
    rank: number;
    name: string;
    lat?: number;
    lng?: number;
    score: number;
    confidence: number;
    // catalog enrichment
    suburb?: string;
    zoning?: string;
    arterial?: string;
    nearestHighwayKm?: number;
    plotSizeHectares?: number;
    priceRange?: string; // e.g. "R 2.2M - R 5M"
    // Task 3 — land price derived from live portal listings by
    // /api/ask. Outranks priceRange when present.
    landPriceLowZAR?: number;
    landPriceHighZAR?: number;
    landPriceSource?: string; // "live_listings" | "catalog"
    medianIncome?: number; // ZAR/month
    competition?: string[];
    // raw signals, for derivation
    signals?: DecisionSignal[];
    dataProvenance?: string;
  };
  vertical: string; // "gas_station" etc.
};

/* ------------------------------------------------------------------ */
/* Derivation helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Parse a catalog price range string into numbers.
 * Handles "R 2.2M - R 5M" and "R 4.5M - R 12M (5-20ha gated estate)" —
 * the trailing parenthetical is ignored because we require the "R"
 * prefix on every number we take.
 */
function parsePriceRange(
  raw?: string,
): { low: number; high: number; mid: number } | null {
  if (!raw) return null;
  const matches = [...raw.matchAll(/R\s*([\d.,]+)\s*([kKmMbB])?/g)];
  const values: number[] = [];
  for (const m of matches) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const suffix = (m[2] ?? "").toLowerCase();
    const mult =
      suffix === "b" ? 1e9 : suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;
    values.push(n * mult);
  }
  if (values.length === 0) return null;
  const low = values[0];
  const high = values.length > 1 ? values[1] : values[0];
  return { low, high, mid: (low + high) / 2 };
}

function findSignal(
  signals: DecisionSignal[],
  predicate: (s: DecisionSignal) => boolean,
): DecisionSignal | undefined {
  return signals.find(predicate);
}

/* --- Task 3: typed reads off the new connectors' payloads --------- */

/** Shape emitted by lib/connectors/sa_zoning.ts. */
type ZoningPayload = {
  metro?: string;
  name?: string;
  category?: string;
  permittedUses?: string;
};

/** Shape emitted by lib/connectors/sa_traffic.ts. */
type TrafficPayload = {
  aadt?: number;
  ref?: string;
  segment?: string;
  distanceKm?: number;
  heavyVehiclePct?: number;
  year?: number;
  source?: string;
};

const METRO_LABEL: Record<string, string> = {
  cape_town: "City of Cape Town",
  johannesburg: "City of Johannesburg",
  ethekwini: "eThekwini",
};

/**
 * SA fuel-station feasibility rule of thumb: below roughly 15,000
 * vehicles/day past the forecourt the volumes don't carry the site.
 * Used only to flag, never to reject.
 */
const FUEL_VIABILITY_AADT = 15_000;

/**
 * The env_constraints connector encodes its findings in the label:
 * "Environmental risks within 2.0km: 3 water/wetland, 1 hazard".
 * Everything after the first colon is the flag list.
 */
function envFlagList(label: string): string {
  const idx = label.indexOf(":");
  const tail = idx >= 0 ? label.slice(idx + 1).trim() : label.trim();
  return tail || "unspecified constraints";
}

/** "Suburb, City: 45,000 residents, ..." -> 45000 */
function populationFromLabel(label: string): number | null {
  const m = label.match(/([\d,\s]+)\s+residents/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------ */
/* Presentation primitives                                             */
/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-atlas-border/40 pt-2.5 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
          {title}
        </h5>
      </div>
      <div className="ml-6 space-y-1 text-xs leading-relaxed">{children}</div>
    </div>
  );
}

/** Real, Atlas-verified content. */
function Fact({ children }: { children: React.ReactNode }) {
  return <p className="text-atlas-text">{children}</p>;
}

/** "Atlas doesn't have this — go get it yourself" callout. */
function ManualCheck({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-amber-400">
      <span aria-hidden="true">⚠</span> {children}
    </p>
  );
}

const iconProps = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "shrink-0 text-atlas-accent",
};

const ZoningIcon = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const TrafficIcon = (
  <svg {...iconProps}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const CatchmentIcon = (
  <svg {...iconProps}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
);
const EconomicsIcon = (
  <svg {...iconProps}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const RiskIcon = (
  <svg {...iconProps} className="shrink-0 text-amber-400">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function DecisionBlock({ site, vertical }: DecisionBlockProps) {
  const signals = site.signals ?? [];
  const econ = getEconomics(vertical);

  /* --- shared derivations (used by more than one section) --------- */

  // Environmental risk. The env_constraints connector inverts weight:
  // 1 = clean, 0 = severe. Below 0.7 means at least a water body or a
  // hazard is inside the 2km ring.
  const envSignal = findSignal(signals, (s) => s.type === "env_risk");
  const envRisky = !!envSignal && envSignal.weight < 0.7;

  // Zoning. Task 3: the sa_zoning connector resolves the scheme zone
  // covering the site. Catalog `site.zoning` (erf-specific where we
  // have it) and this (area-level, from the metro scheme) are
  // complementary, so both render when both exist.
  const zoningSignal = findSignal(
    signals,
    (s) => s.source === "sa_zoning" || s.type === "zoning_class",
  );
  const zoning = (zoningSignal?.payload ?? {}) as ZoningPayload;

  // Traffic. Task 3: the sa_traffic connector supplies AADT. The
  // legacy predicate stays as a fallback so any other traffic source
  // still lights this section up.
  const aadtSignal = findSignal(
    signals,
    (s) => s.source === "sa_traffic" || s.type === "traffic_aadt",
  );
  const aadt = (aadtSignal?.payload ?? {}) as TrafficPayload;
  const trafficSignal =
    aadtSignal ??
    findSignal(
      signals,
      (s) =>
        s.type === "traffic_count" ||
        s.type === "vehicle_count" ||
        s.source === "sanral",
    );

  // Competitor saturation. The competitors connector sets
  // weight = 1 - min(1, count / maxExpected), so a weight at or near
  // zero IS the "count >= maxExpected" condition — we read saturation
  // off the weight rather than duplicating the maxExpected table.
  const compSignal = findSignal(signals, (s) => s.type === "competitor_count");
  const saturated = !!compSignal && compSignal.weight <= 0.25;

  const lowConfidence = (site.confidence ?? 0) < 0.6;

  const demoSignal = findSignal(
    signals,
    (s) => s.type === "demographic_profile",
  );
  const incomeSignal = findSignal(signals, (s) => s.type === "median_income");
  const population = demoSignal ? populationFromLabel(demoSignal.label) : null;
  const monthlyIncome =
    site.medianIncome ??
    (incomeSignal && incomeSignal.value > 0 ? incomeSignal.value : null);

  /* --- Task 3: land price precedence ------------------------------
   * Live portal listings (Property24 + Private Property, matched to
   * this site by /api/ask) beat the catalog's curated band, because
   * they are what the market is asking today. Catalog is the fallback,
   * and "no price at all" still falls through to the manual check. */
  const livePrice =
    site.landPriceLowZAR != null && site.landPriceHighZAR != null
      ? {
          low: site.landPriceLowZAR,
          high: site.landPriceHighZAR,
          mid: (site.landPriceLowZAR + site.landPriceHighZAR) / 2,
        }
      : null;
  const catalogPrice = parsePriceRange(site.priceRange);
  const price = livePrice ?? catalogPrice;
  const priceSource =
    site.landPriceSource ??
    (livePrice ? "live_listings" : catalogPrice ? "catalog" : undefined);
  const payback = price ? projectPayback(price.mid, vertical) : null;

  return (
    <section className="mb-4" data-testid={`decision-block-${site.rank}`}>
      <div className="mb-2 flex items-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-atlas-accent"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-atlas-accent">
          Decision block
        </h4>
        <span className="text-[10px] text-atlas-muted">
          can you build here?
        </span>
      </div>

      <div className="ml-6 space-y-2.5 rounded-md border border-atlas-border bg-atlas-surface2/40 p-3">
        {/* ---------------------------------------------------- 1. Zoning */}
        <Section title="Zoning" icon={ZoningIcon}>
          {site.zoning || zoningSignal ? (
            <>
              {site.zoning && (
                <Fact>
                  Zoned <span className="font-medium">{site.zoning}</span>
                  {site.plotSizeHectares != null && (
                    <>
                      {" · "}
                      {site.plotSizeHectares >= 1
                        ? `${site.plotSizeHectares} ha`
                        : `${Math.round(site.plotSizeHectares * 10000)} m²`}
                    </>
                  )}
                </Fact>
              )}
              {zoningSignal && (
                <>
                  <Fact>
                    <span className="font-medium">
                      {zoning.name ?? zoningSignal.label}
                    </span>
                    {/* Plot size normally rides on the catalog zoning
                        line above; carry it here when the scheme zone
                        is the only zoning fact we have. */}
                    {!site.zoning && site.plotSizeHectares != null && (
                      <>
                        {" · "}
                        {site.plotSizeHectares >= 1
                          ? `${site.plotSizeHectares} ha`
                          : `${Math.round(site.plotSizeHectares * 10000)} m²`}
                      </>
                    )}
                    {zoning.permittedUses && <> · {zoning.permittedUses}</>}
                  </Fact>
                  <p className="text-atlas-muted">
                    {zoning.metro
                      ? `${METRO_LABEL[zoning.metro] ?? zoning.metro} town-planning scheme`
                      : "Municipal town-planning scheme"}{" "}
                    — area-level zoning, not the zoning certificate for this
                    erf.
                  </p>
                </>
              )}
              <ManualCheck>
                Confirm the scheme rights and any consent-use conditions with
                the municipal Land Use Management department before offer.
              </ManualCheck>
            </>
          ) : (
            <ManualCheck>
              Manual check needed: zoning classification — confirm with the
              relevant City Planning office (CoCT, CoJ, eThekwini, etc.).
            </ManualCheck>
          )}

          {envRisky ? (
            <ManualCheck>
              Environmental risk detected within 2km:{" "}
              {envFlagList(envSignal!.label)}. EIA likely required.
            </ManualCheck>
          ) : envSignal ? (
            <Fact>
              No environmental constraints detected within 2km (OpenStreetMap).
            </Fact>
          ) : (
            <ManualCheck>
              Environmental clearance status unknown — confirm before site
              acquisition.
            </ManualCheck>
          )}
        </Section>

        {/* --------------------------------------------------- 2. Traffic */}
        <Section title="Traffic" icon={TrafficIcon}>
          {aadtSignal ? (
            <>
              <Fact>
                <span className="font-medium">
                  {(aadt.aadt ?? aadtSignal.value).toLocaleString()} veh/day
                </span>
                {aadt.ref && <> on {aadt.ref}</>}
                {aadt.segment && <> ({aadt.segment})</>}
                {aadt.distanceKm != null && (
                  <> · {aadt.distanceKm.toFixed(1)}km from site</>
                )}
              </Fact>
              {aadt.heavyVehiclePct != null && (
                <Fact>{aadt.heavyVehiclePct}% heavy vehicles (freight share)</Fact>
              )}
              {site.arterial && <Fact>On {site.arterial}</Fact>}
              {(aadt.aadt ?? aadtSignal.value) < FUEL_VIABILITY_AADT && (
                <ManualCheck>
                  Below the ~{FUEL_VIABILITY_AADT.toLocaleString()} veh/day
                  rule-of-thumb floor for fuel-station viability.
                </ManualCheck>
              )}
              <p className="text-atlas-muted">
                {aadt.source ?? "SANRAL / provincial traffic counts"}
                {aadt.year != null && ` (${aadt.year})`} — segment average, not
                a count at this intersection.
              </p>
            </>
          ) : trafficSignal ? (
            <Fact>{trafficSignal.label}</Fact>
          ) : site.arterial || site.nearestHighwayKm != null ? (
            <>
              <Fact>
                {site.arterial && <>On {site.arterial}</>}
                {site.arterial && site.nearestHighwayKm != null && " · "}
                {site.nearestHighwayKm != null && (
                  <>{site.nearestHighwayKm} km to nearest highway</>
                )}
              </Fact>
              <ManualCheck>
                Vehicle count not measured by Atlas — manual count recommended
                at the intersection. For fuel stations, target ≥15,000 veh/day.
              </ManualCheck>
            </>
          ) : (
            <ManualCheck>
              Manual check needed: traffic count — Atlas doesn&apos;t have
              vehicle-per-day data for this site yet.
            </ManualCheck>
          )}
        </Section>

        {/* ------------------------------------------------- 3. Catchment */}
        <Section title="Catchment" icon={CatchmentIcon}>
          {population != null || monthlyIncome != null ? (
            <>
              {population != null && (
                <Fact>
                  Catchment population: {population.toLocaleString()} residents
                  {site.suburb ? ` (${site.suburb})` : ""}
                </Fact>
              )}
              {monthlyIncome != null && (
                <Fact>
                  Median household income R{" "}
                  {Math.round(monthlyIncome / 1000)}k/mo (Stats SA 2022)
                </Fact>
              )}
            </>
          ) : (
            <ManualCheck>
              Manual check needed: catchment demographics — Atlas doesn&apos;t
              have suburb-level Stats SA data for this location.
            </ManualCheck>
          )}
        </Section>

        {/* ------------------------------------------- 4. Plot economics */}
        <Section title="Plot economics" icon={EconomicsIcon}>
          {price ? (
            <>
              <Fact>
                Land: {formatZAR(price.low)}
                {price.high !== price.low && <> – {formatZAR(price.high)}</>}
                {livePrice ? (
                  <> (live from Property24 + Private Property)</>
                ) : (
                  <> (from catalog)</>
                )}
              </Fact>
              <Fact>
                Build + setup: {formatZAR(econ.buildLowZAR)} –{" "}
                {formatZAR(econ.buildHighZAR)}
              </Fact>
              <Fact>
                Working capital: {formatZAR(econ.workingCapitalZAR)}
              </Fact>
              <Fact>
                <span className="font-medium">
                  Total deploy:{" "}
                  {formatZAR(
                    price.low + econ.buildLowZAR + econ.workingCapitalZAR,
                  )}{" "}
                  –{" "}
                  {formatZAR(
                    price.high + econ.buildHighZAR + econ.workingCapitalZAR,
                  )}
                </span>
              </Fact>
              <Fact>
                At {formatZAR(econ.dailyMarginLowZAR)}–
                {formatZAR(econ.dailyMarginHighZAR)}/day gross margin: payback ~
                {payback?.years != null ? `${payback.years} years` : "—"}{" "}
                <span className="text-atlas-muted">
                  (gross basis; SA net payback typically{" "}
                  {econ.paybackLowYears}–{econ.paybackHighYears} yrs)
                </span>
              </Fact>
              <p className="text-atlas-muted">{econ.notes}</p>
              {priceSource && (
                <p className="text-[10px] text-atlas-muted">
                  Source: {priceSource}
                </p>
              )}
            </>
          ) : (
            <>
              <ManualCheck>
                Manual check needed: economics — Atlas doesn&apos;t have land
                price for this site. Use Property24 + Private Property + a
                recent deeds transaction for comparable plots within 2km.
              </ManualCheck>
              <Fact>
                For reference, build + setup runs{" "}
                {formatZAR(econ.buildLowZAR)} – {formatZAR(econ.buildHighZAR)}{" "}
                plus {formatZAR(econ.workingCapitalZAR)} working capital, with
                payback typically {econ.paybackLowYears}–{econ.paybackHighYears}{" "}
                years.
              </Fact>
            </>
          )}
        </Section>

        {/* ------------------------------------------------------ 5. Risks */}
        <Section title="Risks" icon={RiskIcon}>
          {saturated && (
            <ManualCheck>
              Saturated micro-market: {Math.round(compSignal!.value)} competitors
              within the search radius.
            </ManualCheck>
          )}
          {lowConfidence && (
            <ManualCheck>
              Low confidence score ({Math.round((site.confidence ?? 0) * 100)}%)
              — Atlas couldn&apos;t verify this site strongly. Treat with
              caution.
            </ManualCheck>
          )}
          {envRisky && (
            <ManualCheck>
              Environmental risks nearby — EIA likely required.
            </ManualCheck>
          )}
          {!trafficSignal && (
            <ManualCheck>
              Traffic data unavailable — manual count recommended.
            </ManualCheck>
          )}
          <ManualCheck>
            Manual check needed: confirm any decision with a registered town
            planner + conveyancing attorney before commitment.
          </ManualCheck>
        </Section>
      </div>
    </section>
  );
}

export default DecisionBlock;
