"use client";

/**
 * Atlas — Ranking analytics chart.
 *
 * Day 8 polish: turns the static "ranked sites" list into a real-time
 * analytics chart. Two visualizations side by side:
 *
 *   1. Score bar chart — horizontal bars of score (emerald) per site,
 *      with a translucent confidence bar underneath. Hover any bar to
 *      see a tooltip with the site name, rank, score, confidence, and
 *      the top 1-2 signals that pushed the score.
 *
 *   2. Factor line chart — for the top-3 sites, shows how the 3-4 score
 *      factors compare (e.g. traffic access, demographics, POI density).
 *      Each factor is a line, each site is a point on the line. Hover
 *      a point to see the exact contribution value.
 *
 * Implementation: we draw the chart in pure SVG (no chart library).
 * This keeps the bundle small and gives us full control over the dark
 * theme + indigo accent + hover interactions. A production version
 * could swap in Recharts/Visx for richer interactions, but for a v1
 * this is enough to make the analytics feel "real".
 */

import { useState } from "react";

type Signal = {
  id: string;
  source: string;
  type: string;
  label: string;
  value: number;
  weight: number;
  fetchedAt: string;
};

type ScoreFactor = {
  name: string;
  weight: number;
  contribution: number;
  evidence: string;
};

type ScoreBreakdown = {
  siteId: string;
  baseScore: number;
  signalScore: number;
  confidence: number;
  factors: ScoreFactor[];
};

type Site = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
  signals?: Signal[];
  scoreBreakdown?: ScoreBreakdown;
};

const W = 640;
const H = 220;
const PADDING = { top: 20, right: 16, bottom: 36, left: 160 };
const INNER_W = W - PADDING.left - PADDING.right;
const ROW_H = 28;
const ROW_GAP = 6;
const BAR_H = 14;

export function RankingChart({ sites }: { sites: Site[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);

  if (sites.length === 0) return null;

  // Scale: bar width = score * INNER_W. We pad 0-1 score to a 0-100% scale.
  const xForScore = (s: number) => Math.max(0, Math.min(1, s)) * INNER_W;

  return (
    <section className="rounded-lg border border-atlas-border bg-atlas-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-atlas-text">
          Ranking analytics
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-atlas-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-emerald-400" />
            score
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-atlas-accent/40" />
            confidence
          </span>
        </div>
      </div>

      <div
        className="relative"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMouseX(e.clientX - rect.left);
          setMouseY(e.clientY - rect.top);
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          className="block"
          role="img"
          aria-label="Score per site"
        >
          {/* X-axis grid + labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const x = PADDING.left + tick * INNER_W;
            return (
              <g key={tick}>
                <line
                  x1={x}
                  x2={x}
                  y1={PADDING.top}
                  y2={H - PADDING.bottom}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  className="text-atlas-text"
                />
                <text
                  x={x}
                  y={H - PADDING.bottom + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  className="text-atlas-muted"
                >
                  {(tick * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* Site rows */}
          {sites.map((s, i) => {
            const y = PADDING.top + i * (ROW_H + ROW_GAP);
            const scoreW = xForScore(s.score);
            const confW = xForScore(s.confidence);
            const confX = PADDING.left + scoreW - confW; // confidence overlays the score bar from the right
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Row hover highlight */}
                {isHovered && (
                  <rect
                    x={0}
                    y={y - 4}
                    width={W}
                    height={ROW_H + 8}
                    fill="currentColor"
                    fillOpacity={0.05}
                    className="text-atlas-text"
                  />
                )}

                {/* Site name (truncated) */}
                <text
                  x={PADDING.left - 8}
                  y={y + ROW_H / 2 + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontWeight={isHovered ? 600 : 400}
                  fill="currentColor"
                  className="text-atlas-text"
                >
                  {truncate(s.name, 22)}
                </text>

                {/* Confidence bar (background, semi-transparent) */}
                <rect
                  x={PADDING.left}
                  y={y + 2}
                  width={confW}
                  height={BAR_H}
                  rx={3}
                  fill="currentColor"
                  fillOpacity={0.15}
                  className="text-atlas-accent"
                />

                {/* Score bar (foreground, emerald) */}
                <rect
                  x={PADDING.left}
                  y={y + 2}
                  width={scoreW}
                  height={BAR_H}
                  rx={3}
                  fill="#34d399"
                  fillOpacity={isHovered ? 1 : 0.85}
                />

                {/* Score label at the end of the bar */}
                {scoreW > 30 && (
                  <text
                    x={PADDING.left + scoreW - 6}
                    y={y + 2 + BAR_H / 2 + 4}
                    textAnchor="end"
                    fontSize="10"
                    fontWeight={600}
                    fill="#0a0a0b"
                  >
                    {(s.score * 100).toFixed(0)}
                  </text>
                )}

                {/* Rank badge */}
                <circle
                  cx={PADDING.left - 132}
                  cy={y + ROW_H / 2}
                  r={9}
                  fill="currentColor"
                  fillOpacity={0.1}
                  className="text-atlas-accent"
                />
                <text
                  x={PADDING.left - 132}
                  y={y + ROW_H / 2 + 3.5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={600}
                  fill="currentColor"
                  className="text-atlas-accent"
                >
                  {s.rank}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredIdx !== null && (
          <ChartTooltip
            site={sites[hoveredIdx]}
            x={mouseX}
            y={mouseY}
            containerW={W}
            containerH={H}
          />
        )}
      </div>

      {/* Per-site factor breakdown — small line chart for the top 3 */}
      <FactorChart sites={sites.slice(0, 3)} />

      <p className="mt-3 text-[10px] text-atlas-muted">
        Hover any bar to see the site's full stats.{" "}
        {sites.length > 0 && (
          <>
            Top 3 sites show factor-by-factor breakdown below.{" "}
          </>
        )}
      </p>
    </section>
  );
}

function ChartTooltip({
  site,
  x,
  y,
  containerW,
  containerH,
}: {
  site: Site;
  x: number;
  y: number;
  containerW: number;
  containerH: number;
}) {
  // The container has the SVG width-stretching. We need to scale the
  // mouse coords from container px back to viewBox units.
  const scaleX = containerW / (typeof window !== "undefined" ? Math.max(document.querySelector("svg[role=img]")?.clientWidth ?? containerW, 1) : containerW);
  const tipW = 240;
  const tipH = 130;
  // Clamp inside the container.
  const tipX = Math.max(8, Math.min(x * scaleX + 12, containerW - tipW - 8));
  const tipY = Math.max(8, Math.min(y - tipH - 8, containerH - tipH - 8));

  // Pick top 1-2 signals by weight for the tooltip.
  const topSignals = (site.signals ?? [])
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2);

  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-atlas-border bg-atlas-bg/95 p-3 shadow-xl shadow-black/40 backdrop-blur"
      style={{ left: tipX, top: tipY, width: tipW }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-atlas-accent/15 text-[10px] font-semibold text-atlas-accent">
          {site.rank}
        </span>
        <span className="truncate text-xs font-semibold text-atlas-text">
          {truncate(site.name, 30)}
        </span>
      </div>
      <div className="mb-1.5 flex items-center gap-2 text-[10px]">
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-emerald-300">
          score {(site.score * 100).toFixed(1)}%
        </span>
        <span className="rounded bg-atlas-surface2 px-1.5 py-0.5 font-mono text-atlas-muted">
          conf {(site.confidence * 100).toFixed(1)}%
        </span>
      </div>
      {site.rationale && (
        <p className="mb-1.5 line-clamp-2 text-[10px] leading-relaxed text-atlas-muted">
          {site.rationale}
        </p>
      )}
      {topSignals.length > 0 && (
        <div className="border-t border-atlas-border pt-1.5">
          <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-atlas-muted">
            Top signals
          </div>
          {topSignals.map((s, i) => (
            <div key={i} className="text-[10px] text-atlas-text">
              <span className="text-atlas-muted">·</span> {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FactorChart({ sites }: { sites: Site[] }) {
  // If no site has a score breakdown, hide this section entirely.
  if (sites.every((s) => !s.scoreBreakdown || s.scoreBreakdown.factors.length === 0)) {
    return null;
  }

  // Collect the union of factor names across the displayed sites so the
  // x-axis is consistent.
  const factorNames = Array.from(
    new Set(
      sites.flatMap((s) =>
        (s.scoreBreakdown?.factors ?? []).map((f) => f.name)
      )
    )
  );
  if (factorNames.length === 0) return null;

  // Contribution range across all displayed data so the y-axis is
  // shared.
  let minC = 0;
  let maxC = 0;
  for (const s of sites) {
    for (const f of s.scoreBreakdown?.factors ?? []) {
      if (f.contribution < minC) minC = f.contribution;
      if (f.contribution > maxC) maxC = f.contribution;
    }
  }
  // Pad the range so points don't sit on the edge.
  const range = maxC - minC || 1;
  const yMin = minC - range * 0.1;
  const yMax = maxC + range * 0.1;

  const FW = 640;
  const FH = 160;
  const FP = { top: 16, right: 16, bottom: 36, left: 100 };
  const FW_INNER = FW - FP.left - FP.right;
  const FH_INNER = FH - FP.top - FP.bottom;
  const xFor = (i: number) =>
    FP.left + (factorNames.length === 1 ? FW_INNER / 2 : (i / (factorNames.length - 1)) * FW_INNER);
  const yFor = (v: number) =>
    FP.top + (1 - (v - yMin) / (yMax - yMin || 1)) * FH_INNER;

  const siteColors = ["#818cf8", "#34d399", "#fbbf24"];

  return (
    <div className="mt-4 border-t border-atlas-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
          Score factors (top 3 sites)
        </h3>
        <div className="flex items-center gap-2 text-[10px]">
          {sites.map((s, i) => (
            <span key={i} className="flex items-center gap-1 text-atlas-muted">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: siteColors[i % siteColors.length] }}
              />
              #{s.rank} {truncate(s.name, 16)}
            </span>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${FW} ${FH}`}
        width="100%"
        height={FH}
        className="block"
        role="img"
        aria-label="Score factor breakdown"
      >
        {/* y=0 grid line */}
        <line
          x1={FP.left}
          x2={FW - FP.right}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="currentColor"
          strokeOpacity={0.15}
          className="text-atlas-text"
        />
        <text
          x={FP.left - 6}
          y={yFor(0) + 3}
          textAnchor="end"
          fontSize="9"
          fill="currentColor"
          className="text-atlas-muted"
        >
          0
        </text>

        {/* X-axis labels */}
        {factorNames.map((name, i) => (
          <g key={name}>
            <line
              x1={xFor(i)}
              x2={xFor(i)}
              y1={FP.top}
              y2={FH - FP.bottom}
              stroke="currentColor"
              strokeOpacity={0.06}
              className="text-atlas-text"
            />
            <text
              x={xFor(i)}
              y={FH - FP.bottom + 14}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              className="text-atlas-muted"
            >
              {truncate(name, 14)}
            </text>
          </g>
        ))}

        {/* Per-site line + points */}
        {sites.map((s, si) => {
          const color = siteColors[si % siteColors.length];
          const points = factorNames.map((fn, i) => {
            const f = (s.scoreBreakdown?.factors ?? []).find((x) => x.name === fn);
            const v = f?.contribution ?? 0;
            return { x: xFor(i), y: yFor(v), v, name: fn };
          });
          const path = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
            .join(" ");
          return (
            <g key={si}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeOpacity={0.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill={color}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="text-atlas-bg"
                  />
                  <title>
                    {`${s.name} · ${p.name}: ${p.v.toFixed(2)}`}
                  </title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
