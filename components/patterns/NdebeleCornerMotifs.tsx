/**
 * Sep 2026 MVP — Stacked triangle corner motif.
 *
 * The signature Ndebele house-painting corner: a large triangle
 * with a smaller, slightly offset triangle stacked inside it. The
 * two triangles are the same color at different opacities so the
 * small one reads as an "echo" inside the big one — exactly the
 * way Ndebele women paint them on the corners of their homes.
 *
 * Two orientation variants:
 *   - "tl": big triangle anchored to top-left, small one inside
 *   - "br": big triangle anchored to bottom-right, small one inside
 *
 * Color: orange or green, set via the color prop. Default orange.
 *
 * Sized large (default 320px) so it's a real anchor on the page,
 * not a decoration.
 */

import * as React from "react";

type Corner = "tl" | "br";
type Color = "orange" | "green";

const COLORS: Record<Color, string> = {
  orange: "#ea7a1f",
  green: "#3f8d4e",
};

export function StackedTriangle({
  corner = "tl",
  color = "orange",
  size = 320,
  className,
}: {
  corner?: Corner;
  color?: Color;
  size?: number;
  className?: string;
}) {
  const c = COLORS[color];

  // The viewBox is 100x100. Big triangle fills most of it; small one
  // sits inside offset toward the inside of the page.
  const big =
    corner === "tl"
      ? "M0 0 L100 0 L0 100 Z"
      : "M100 100 L0 100 L100 0 Z";
  // Small triangle sits inside, offset toward centre
  const small =
    corner === "tl"
      ? "M22 22 L78 22 L22 78 Z"
      : "M78 78 L22 78 L78 22 Z";

  // Position on the page depending on corner
  const pos: React.CSSProperties =
    corner === "tl"
      ? { top: 0, left: 0 }
      : { bottom: 0, right: 0 };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        pointerEvents: "none",
        ...pos,
      }}
    >
      {/* Big triangle — high opacity, the dominant shape */}
      <path d={big} fill={c} fillOpacity={0.85} />
      {/* Small triangle inside — softer echo */}
      <path d={small} fill={c} fillOpacity={0.45} />
    </svg>
  );
}

/**
 * Single accent triangle — a small one for mid-page placement.
 * Used to add visual punctuation without spamming the layout.
 */
export function AccentTriangle({
  color = "orange",
  size = 60,
  rotation = 0,
  className,
  style,
}: {
  color?: Color;
  size?: number;
  rotation?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = COLORS[color];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        pointerEvents: "none",
        transform: `rotate(${rotation}deg)`,
        ...style,
      }}
    >
      <path d="M50 5 L95 95 L5 95 Z" fill={c} fillOpacity={0.85} />
    </svg>
  );
}

/**
 * Vertical zigzag accent strip — a single column of zigzags.
 * Used on left/right edges. Smaller and more subtle than the
 * pattern-fill version.
 */
export function ZigzagStrip({
  color = "orange",
  height = 240,
  width = 60,
  position = "left",
  className,
  style,
}: {
  color?: Color;
  height?: number;
  width?: number;
  position?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = COLORS[color];
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 200"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        pointerEvents: "none",
        ...(position === "left"
          ? { left: 0, top: "50%", transform: "translateY(-50%)" }
          : { right: 0, top: "50%", transform: "translateY(-50%) scaleX(-1)" }),
        ...style,
      }}
    >
      <path
        d="M0 25 L15 10 L30 25 L45 10 L60 25"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M0 60 L15 45 L30 60 L45 45 L60 60"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M0 95 L15 80 L30 95 L45 80 L60 95"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M0 130 L15 115 L30 130 L45 115 L60 130"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M0 165 L15 150 L30 165 L45 150 L60 165"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
