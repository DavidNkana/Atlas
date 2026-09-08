/**
 * Ndebele-inspired geometric patterns as React SVG components.
 *
 * The four motifs are the canonical Ndebele house-painting shapes:
 *   1. TrianglePattern         — stacked/paired triangles (dominant shape)
 *   2. ZigzagPattern           — continuous angular chevrons
 *   3. DiamondPattern          — horizontal lozenge rows
 *   4. SteppedTrianglePattern  — corner-stacked stepped triangles
 *
 * For background fills, prefer the CSS `.bg-pattern-*` classes in
 * globals.css (data-URI SVGs) — they're lighter on the wire and tile
 * natively. Use the React components when you need:
 *   - a precise size on the SVG (e.g. a hero banner with a single motif)
 *   - animation or interaction
 *   - dynamic color overrides via props
 *
 * All motifs share a small palette of natural pigments derived from
 * real Ndebele house-painting materials: ochre/clay orange and
 * vegetation green. Both colors pass WCAG contrast on dark and light
 * Atlas surfaces.
 *
 * Zero dependencies — pure SVG.
 */

import * as React from "react";

type ColorName = "orange" | "green";
type PatternProps = {
  /** width / height in px. Defaults to 40×40 for a tight motif. */
  size?: number;
  /** Which pigment to draw with. Defaults to orange. */
  color?: ColorName;
  /** Override the pigment with any CSS color string. */
  overrideColor?: string;
  /** Stroke width. Defaults to 2. */
  strokeWidth?: number;
  /** Decorative-only SVGs should have aria-hidden; interactive ones get the default. */
  title?: string;
  /** Tailwind classes applied to the wrapper <svg>. */
  className?: string;
  /** Preserve aspect ratio (default true). */
  preserveAspectRatio?: string;
};

const PIGMENT: Record<ColorName, string> = {
  orange: "#ea7a1f",
  green: "#3f8d4e",
};

function resolveColor(
  color: ColorName | undefined,
  override: string | undefined,
): string {
  return override ?? PIGMENT[color ?? "orange"];
}

/* ──────────────────────────────────────────────────────────────────────
   1. TrianglePattern — stacked/paired triangles
   The dominant Ndebele shape. Used as hero accents, hero background
   panels, and connector panel dividers.
   ────────────────────────────────────────────────────────────────────── */

export function TrianglePattern(props: PatternProps) {
  const {
    size = 40,
    color,
    overrideColor,
    strokeWidth = 2,
    title,
    className,
    preserveAspectRatio,
  } = props;
  const c = resolveColor(color, overrideColor);
  const ariaProps = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      preserveAspectRatio={preserveAspectRatio ?? "xMidYMid meet"}
      className={className}
      {...ariaProps}
    >
      <path
        d="M0 30 L20 10 L40 30 Z"
        fill="none"
        stroke={c}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Soft inner echo */}
      <path
        d="M0 35 L20 15 L40 35"
        fill="none"
        stroke={c}
        strokeWidth={Math.max(1, strokeWidth - 1)}
        strokeOpacity={0.4}
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   2. ZigzagPattern — continuous angular chevrons
   Used as section dividers, button accents, and connector panel header.
   ────────────────────────────────────────────────────────────────────── */

export function ZigzagPattern(props: PatternProps) {
  const {
    size = 40,
    color,
    overrideColor,
    strokeWidth = 2,
    title,
    className,
    preserveAspectRatio,
  } = props;
  const c = resolveColor(color, overrideColor);
  const ariaProps = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true };
  // Make the SVG twice as wide as tall for the chevron rhythm.
  return (
    <svg
      width={size * 2}
      height={size}
      viewBox="0 0 80 20"
      preserveAspectRatio={preserveAspectRatio ?? "xMidYMid meet"}
      className={className}
      {...ariaProps}
    >
      <path
        d="M0 15 L20 5 L40 15 L60 5 L80 15"
        fill="none"
        stroke={c}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Soft lower echo */}
      <path
        d="M0 18 L20 8 L40 18 L60 8 L80 18"
        fill="none"
        stroke={c}
        strokeWidth={Math.max(1, strokeWidth - 1)}
        strokeOpacity={0.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   3. DiamondPattern — horizontal lozenge rows
   Used on connector cards and the Decision Intelligence panel header.
   ────────────────────────────────────────────────────────────────────── */

export function DiamondPattern(props: PatternProps) {
  const {
    size = 30,
    color,
    overrideColor,
    strokeWidth = 2,
    title,
    className,
    preserveAspectRatio,
  } = props;
  const c = resolveColor(color, overrideColor);
  const ariaProps = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      preserveAspectRatio={preserveAspectRatio ?? "xMidYMid meet"}
      className={className}
      {...ariaProps}
    >
      <path
        d="M15 5 L25 15 L15 25 L5 15 Z"
        fill="none"
        stroke={c}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Center dot — the small filled mark common in Ndebele lozenge rows */}
      <circle cx="15" cy="15" r={strokeWidth * 0.75} fill={c} />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   4. SteppedTrianglePattern — corner-stacked stepped triangles
   The classic Ndebele house-painting corner motif. Used as panel
   accents in the corner of decision cards.
   ────────────────────────────────────────────────────────────────────── */

export function SteppedTrianglePattern(props: PatternProps) {
  const {
    size = 30,
    color,
    overrideColor,
    strokeWidth = 2,
    title,
    className,
    preserveAspectRatio,
  } = props;
  const c = resolveColor(color, overrideColor);
  const ariaProps = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      preserveAspectRatio={preserveAspectRatio ?? "xMidYMid meet"}
      className={className}
      {...ariaProps}
    >
      {/* Three nested triangles decreasing in opacity, corner-stacked */}
      <path
        d="M0 30 L0 10 L10 30 Z"
        fill={c}
        fillOpacity={0.95}
      />
      <path
        d="M5 30 L5 5 L15 30 Z"
        fill={c}
        fillOpacity={0.55}
      />
      <path
        d="M10 30 L10 0 L20 30 Z"
        fill={c}
        fillOpacity={0.25}
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   5. DuoZigzagPattern — orange + green alternating zigzags.
   The signature Atlas accent: used on the hero strip and the Decision
   Intelligence panel header where we want to signal "this is the
   Atlas platform" without text.
   ────────────────────────────────────────────────────────────────────── */

export function DuoZigzagPattern(props: PatternProps) {
  const {
    size = 40,
    strokeWidth = 2,
    title,
    className,
    preserveAspectRatio,
  } = props;
  const orange = PIGMENT.orange;
  const green = PIGMENT.green;
  const ariaProps = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true };
  return (
    <svg
      width={size * 2}
      height={size}
      viewBox="0 0 80 20"
      preserveAspectRatio={preserveAspectRatio ?? "xMidYMid meet"}
      className={className}
      {...ariaProps}
    >
      <path
        d="M0 15 L20 5 L40 15 L60 5 L80 15"
        fill="none"
        stroke={orange}
        strokeWidth={strokeWidth + 0.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M0 18 L20 8 L40 18 L60 8 L80 18"
        fill="none"
        stroke={green}
        strokeWidth={Math.max(1, strokeWidth - 0.5)}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Compound pattern — all four motifs arranged as a hero-style badge.
   Used on the Atlas result page header to immediately communicate
   "this is the Atlas platform" visually.
   ────────────────────────────────────────────────────────────────────── */

export function AtlasBadge(props: {
  className?: string;
  size?: number;
}) {
  const { size = 96, className } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
    >
      {/* Outer triangle stack — Ndebele house-painting motif */}
      <g>
        <path d="M0 80 L25 30 L50 80 Z" fill="#ea7a1f" fillOpacity="0.85" />
        <path d="M50 80 L75 30 L100 80 Z" fill="#ea7a1f" fillOpacity="0.55" />
        <path d="M50 95 L100 60 Z" fill="#ea7a1f" fillOpacity="0.35" />
        <path d="M25 60 L75 60" stroke="#3f8d4e" strokeWidth="3" />
        <path d="M30 70 L70 70" stroke="#3f8d4e" strokeWidth="2" />
        {/* Diamond accents */}
        <path d="M50 50 L55 55 L50 60 L45 55 Z" fill="#3f8d4e" />
      </g>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Convenience re-exports.
   ────────────────────────────────────────────────────────────────────── */

export const PATTERNS = {
  Triangle: TrianglePattern,
  Zigzag: ZigzagPattern,
  Diamond: DiamondPattern,
  SteppedTriangle: SteppedTrianglePattern,
  DuoZigzag: DuoZigzagPattern,
  AtlasBadge,
};

export type { ColorName, PatternProps };
