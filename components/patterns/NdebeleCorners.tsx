/**
 * Sep 2026 MVP — Larger Ndebele pattern blocks anchored to page corners.
 *
 * Unlike the small PATTERNS components (which are inline icons), these
 * are full-bleed decoration: 120-300px square SVG blocks that sit
 * absolutely-positioned in a page corner with deliberate pointer-events-none.
 *
 * Each corner uses a different motif so all four corners tell the
 * Ndebele story:
 *   - top-left:     stacked triangles (dominant motif)
 *   - top-right:    zigzag (horizontal)
 *   - bottom-left:  stepped triangles (house-painting corner)
 *   - bottom-right: diamonds (lozenge rows)
 *
 * The blocks are large but faded (5-12% opacity) so they read as
 * decorative rather than dominant.
 *
 * No client-side animation by default — keeps first-paint cheap. Use
 * the `shimmer` prop to add the optional orange→green shimmer animation.
 */

import * as React from "react";
import {
  TrianglePattern,
  ZigzagPattern,
  DiamondPattern,
  SteppedTrianglePattern,
} from "./NdebelePatterns";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type Side = "left" | "right";
type Anchor = Corner | Side;

/**
 * Map each anchor to the motif and colour used.
 *
 * top-left / bottom-left → orange (the dominant clay/orange accent)
 * top-right / bottom-right → green (the secondary vegetation accent)
 * sides → zigzags (continuous angular lines)
 */
const ANCHOR_MOTIF: Record<
  Anchor,
  { color: "orange" | "green"; motif: "triangle" | "zigzag" | "diamond" | "stepped" }
> = {
  "top-left":     { color: "orange", motif: "triangle" },
  "top-right":    { color: "green",  motif: "zigzag" },
  "bottom-left":  { color: "orange", motif: "stepped" },
  "bottom-right": { color: "green",  motif: "diamond" },
  left:          { color: "orange", motif: "zigzag" },
  right:         { color: "green",  motif: "zigzag" },
};

function CornerMotif({
  anchor,
  size = 180,
  opacity = 0.12,
}: {
  anchor: Anchor;
  size?: number;
  opacity?: number;
}) {
  const { color, motif } = ANCHOR_MOTIF[anchor];

  // Each motif renders a tiled block rather than a single shape, so the
  // corner feels filled rather than sparse.
  if (motif === "triangle") {
    // Stack triangles by tiling the basic triangle motif in a grid.
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
        style={{ opacity }}
      >
        <defs>
          <pattern id="corner-triangle-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 15 L10 5 L20 15 Z" fill="none" stroke="#ea7a1f" strokeWidth="1.4" />
            <path d="M0 18 L10 8 L20 18" fill="none" stroke="#ea7a1f" strokeWidth="0.9" strokeOpacity={0.4} />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#corner-triangle-pattern)" />
      </svg>
    );
  }

  if (motif === "zigzag") {
    return (
      <svg
        width={size * 2}
        height={size}
        viewBox="0 0 200 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
        style={{ opacity }}
      >
        <defs>
          <pattern id="corner-zigzag-pattern" x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 15 L10 5 L20 15 L30 5 L40 15" fill="none" stroke="#3f8d4e" strokeWidth="1.6" />
            <path d="M0 18 L10 8 L20 18 L30 8 L40 18" fill="none" stroke="#3f8d4e" strokeWidth="0.9" strokeOpacity={0.4} />
          </pattern>
        </defs>
        <rect width="200" height="100" fill="url(#corner-zigzag-pattern)" />
      </svg>
    );
  }

  if (motif === "diamond") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
        style={{ opacity }}
      >
        <defs>
          <pattern id="corner-diamond-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M10 2 L18 10 L10 18 L2 10 Z" fill="none" stroke="#3f8d4e" strokeWidth="1.2" />
            <circle cx="10" cy="10" r="0.9" fill="#3f8d4e" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#corner-diamond-pattern)" />
      </svg>
    );
  }

  // stepped — the Ndebele house-painting corner motif: nested triangles
  // decreasing in opacity, anchored bottom-left.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ opacity }}
    >
      <defs>
        <pattern id="corner-stepped-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 20 L0 8 L8 20 Z" fill="#ea7a1f" fillOpacity={0.95} />
          <path d="M3 20 L3 4 L11 20 Z" fill="#ea7a1f" fillOpacity={0.55} />
          <path d="M6 20 L6 0 L14 20 Z" fill="#ea7a1f" fillOpacity={0.25} />
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#corner-stepped-pattern)" />
    </svg>
  );
}

/**
 * Map anchor to absolute positioning + rotation. Rotating the motif
 * 90°/180°/270° makes the same tile feel intentional at each corner.
 */
function anchorToStyle(anchor: Anchor, size: number): React.CSSProperties {
  const half = size / 2;
  switch (anchor) {
    case "top-left":
      return { top: 0, left: 0 };
    case "top-right":
      return { top: 0, right: 0, transform: "scaleX(-1)" };
    case "bottom-left":
      return { bottom: 0, left: 0, transform: "scaleY(-1)" };
    case "bottom-right":
      return { bottom: 0, right: 0, transform: "scale(-1, -1)" };
    case "left":
      return {
        top: "50%",
        left: 0,
        transform: `translateY(-50%) rotate(90deg) translateX(-${half / 2}px)`,
      };
    case "right":
      return {
        top: "50%",
        right: 0,
        transform: `translateY(-50%) rotate(-90deg) translateX(-${half / 2}px)`,
      };
  }
}

/**
 * NdebeleCorners — render the four corner patterns (or just one).
 *
 * Pass `which` to select which corners show; defaults to all four.
 * Each corner is rendered as a separate absolutely-positioned SVG so
 * the parent doesn't need to be position:relative.
 */
export function NdebeleCorners({
  which = ["top-left", "top-right", "bottom-left", "bottom-right"],
  size = 180,
  opacity = 0.12,
}: {
  which?: Anchor[];
  size?: number;
  opacity?: number;
}) {
  return (
    <>
      {which.map((anchor) => (
        <div
          key={anchor}
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            width: anchor === "left" || anchor === "right" ? size * 2 : size,
            height: anchor === "left" || anchor === "right" ? size : size,
            ...anchorToStyle(anchor, size),
          }}
        >
          <CornerMotif anchor={anchor} size={size} opacity={opacity} />
        </div>
      ))}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   NdebeleGradientStrip — vertical top-to-bottom gradient with
   orange and green stops and a zig-zag SVG overlay. Use as a
   <section> background or page wrapper.
   ────────────────────────────────────────────────────────────────────── */

export function NdebeleGradientStrip({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className ?? ""}`}
    >
      {/* Top → bottom gradient: orange → green at 4-8% opacity */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(234,122,31,0.10) 0%, rgba(234,122,31,0.04) 25%, rgba(63,141,78,0.04) 75%, rgba(63,141,78,0.10) 100%)",
        }}
      />
      {/* Subtle zig-zag pattern overlay */}
      <div
        className="absolute inset-0 bg-pattern-zigzag-duo opacity-[0.05]"
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   GlassCard — a reusable glassmorphism wrapper.
   - backdrop-blur-md gives the frosted-glass effect
   - bg-white/5 (dark mode) or bg-white/40 (light) for the translucent layer
   - border-white/10 for the subtle highlight
   ────────────────────────────────────────────────────────────────────── */

export function GlassCard({
  children,
  className,
  intensity = "default",
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: "subtle" | "default" | "strong";
}) {
  // Map intensity to the translucency/border opacity.
  const styles: Record<string, string> = {
    subtle: "bg-white/[0.03] border-white/[0.06]",
    default: "bg-white/[0.05] border-white/[0.10]",
    strong: "bg-white/[0.08] border-white/[0.15]",
  };
  return (
    <div
      className={`relative backdrop-blur-md backdrop-saturate-150 rounded-lg border ${styles[intensity]} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
