/**
 * Sep 2026 MVP — Single-instance Ndebele motifs for hero placement.
 *
 * The SAFAI reference style: sparse motifs scattered as deliberate
 * punctuation, NOT corner-anchored or symmetric. Each motif is
 * a single SVG (not tiled) — one triangle here, one triangle there.
 *
 * The "stacked" variants put a smaller, softer-echo triangle on top
 * of the larger one — the classic Ndebele house-painting corner.
 *
 * All are `pointer-events-none` `absolute` so they sit behind the
 * content. Position is set via the `style` prop or the wrapper.
 */

import * as React from "react";

type Color = "orange" | "green";

const COLORS: Record<Color, string> = {
  orange: "#ea7a1f",
  green: "#3f8d4e",
};

/** Single solid triangle. Default: pointing down (Ndebele standard). */
export function SolidTriangle({
  color = "orange",
  size = 80,
  flip = false,
  className,
  style,
}: {
  color?: Color;
  size?: number;
  flip?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = COLORS[color];
  // Flip = mirror across X axis (for upward-pointing triangles)
  const d = flip ? "M5 5 L95 5 L50 95 Z" : "M50 5 L95 95 L5 95 Z";
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
        ...style,
      }}
    >
      <path d={d} fill={c} fillOpacity={0.85} />
    </svg>
  );
}

/**
 * Ndebele house-painting corner motif: a large triangle with a
 * smaller, lighter-echo triangle stacked on top. This is the
 * signature motif — large, bold, unmistakable.
 *
 * Use for the top-left and bottom-right hero anchors.
 */
export function StackedCorner({
  color = "orange",
  size = 320,
  position = "top-left",
  className,
}: {
  color?: Color;
  size?: number;
  position?: "top-left" | "bottom-right";
  className?: string;
}) {
  const c = COLORS[color];
  const isTopLeft = position === "top-left";

  // Big triangle: takes the corner.
  // TL: fills top-left (right-angle at top-left)
  // BR: fills bottom-right (right-angle at bottom-right)
  const big = isTopLeft ? "M0 0 L100 0 L0 100 Z" : "M100 100 L0 100 L100 0 Z";

  // Small triangle stacked on top of the big one, offset toward centre
  // TL: smaller sits in the lower-right of the big triangle
  // BR: smaller sits in the upper-left of the big triangle
  const small = isTopLeft ? "M22 78 L78 78 L22 22 Z" : "M78 22 L22 22 L78 78 Z";

  const pos: React.CSSProperties = isTopLeft
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
      <path d={big} fill={c} fillOpacity={0.9} />
      <path d={small} fill={c} fillOpacity={0.45} />
    </svg>
  );
}

/**
 * Vertical zigzag strip — for the left/right edges.
 * Single column of zigzags, sparse and short (not full page height).
 */
export function ZigzagAccent({
  color = "orange",
  width = 60,
  height = 160,
  className,
  style,
}: {
  color?: Color;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = COLORS[color];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        pointerEvents: "none",
        ...style,
      }}
    >
      <path
        d={`M0 20 L${width / 2} 5 L${width} 20`}
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={`M0 ${height / 2} L${width / 2} ${height / 2 - 15} L${width} ${height / 2}`}
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={`M0 ${height - 20} L${width / 2} ${height - 35} L${width} ${height - 20}`}
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
