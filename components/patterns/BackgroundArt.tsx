/**
 * Sep 2026 MVP — SAFAI-style background art layer.
 *
 * Re-creates the exact Ndebele motifs from the SAFAI reference site.
 * The motifs are:
 *
 *  - Top-left corner:    big orange triangle (gradient-faded) +
 *                         smaller stacked triangles + green zigzags +
 *                         a green diamond row.
 *
 *  - Bottom-right corner: big green triangle + orange triangle +
 *                          orange zigzags + orange diamonds.
 *
 *  - Left side strip:    small alternating orange/green triangles
 *                         plus tiny line accents.
 *
 *  - Right side strip:   small alternating green/orange triangles.
 *
 * Each motif is one SVG (not tiled) — sparse and deliberate, just
 * like the reference. Position is `position: absolute` so the
 * wrappers render at the page level.
 */

import * as React from "react";

const ORANGE = "#ea7a1f";
const ORANGE_2 = "#c14a00";
const GREEN = "#3f8d4e";
const GREEN_2 = "#0e7a4a";

/* ────────────────────────────────────────────────────────────────────
   Top-left corner motif — matches SAFAI's bg-art__corner--tl exactly.
   Big orange triangle (gradient-faded) + 3 smaller stacked triangles
   + green zigzags + green diamond row.
   ──────────────────────────────────────────────────────────────────── */

export function CornerTL({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "absolute",
        top: -40,
        left: -40,
        width: "clamp(220px, 30vw, 460px)",
        height: "auto",
        pointerEvents: "none",
        opacity: 0.95,
      }}
    >
      <defs>
        <linearGradient id="g-orange" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={ORANGE} stopOpacity={0.5} />
          <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
        </linearGradient>
        <linearGradient
          id="g-green"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor={GREEN} stopOpacity={0.45} />
          <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Big triangle — gradient faded */}
      <polygon points="0,0 180,0 0,180" fill="url(#g-orange)" />
      {/* Smaller stacked triangles */}
      <polygon points="40,0 100,0 40,60 0,60" fill={ORANGE} opacity={0.18} />
      <polygon points="0,140 60,140 0,200" fill={GREEN} opacity={0.22} />
      <polygon points="120,0 180,0 120,60" fill={ORANGE} opacity={0.14} />
      {/* Zigzag pattern */}
      <polyline
        points="0,260 30,230 60,260 90,230 120,260 150,230 180,260"
        fill="none"
        stroke={GREEN}
        strokeWidth={2}
        opacity={0.5}
      />
      <polyline
        points="0,290 30,260 60,290 90,260 120,290 150,260 180,290"
        fill="none"
        stroke={ORANGE}
        strokeWidth={2}
        opacity={0.4}
      />
      {/* Diamond stack */}
      <g
        transform="translate(80,330)"
        fill="none"
        stroke={GREEN}
        strokeWidth={1.5}
        opacity={0.5}
      >
        <polygon points="0,-15 15,0 0,15 -15,0" />
        <polygon points="30,-15 45,0 30,15 15,0" />
        <polygon points="60,-15 75,0 60,15 45,0" />
      </g>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Bottom-right corner motif — matches SAFAI's bg-art__corner--br.
   ──────────────────────────────────────────────────────────────────── */

export function CornerBR({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "absolute",
        bottom: -40,
        right: -40,
        width: "clamp(220px, 30vw, 460px)",
        height: "auto",
        pointerEvents: "none",
        opacity: 0.95,
      }}
    >
      <polygon points="400,400 220,400 400,220" fill={GREEN} opacity={0.16} />
      <polygon points="360,400 400,400 360,360" fill={ORANGE} opacity={0.22} />
      <polygon points="280,400 340,400 280,340" fill={GREEN} opacity={0.18} />
      <polygon points="400,260 360,260 400,220" fill={ORANGE} opacity={0.12} />
      <polyline
        points="220,140 250,170 280,140 310,170 340,140 370,170 400,140"
        fill="none"
        stroke={ORANGE}
        strokeWidth={2}
        opacity={0.45}
      />
      <polyline
        points="220,110 250,80 280,110 310,80 340,110 370,80 400,110"
        fill="none"
        stroke={GREEN}
        strokeWidth={2}
        opacity={0.45}
      />
      <g
        transform="translate(220,70)"
        fill="none"
        stroke={ORANGE}
        strokeWidth={1.5}
        opacity={0.5}
      >
        <polygon points="0,-15 15,0 0,15 -15,0" />
        <polygon points="30,-15 45,0 30,15 15,0" />
      </g>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Left-side strip — small alternating orange/green triangles + line
   accents. Matches SAFAI's bg-art__side--left.
   ──────────────────────────────────────────────────────────────────── */

export function SideLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 800"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: "clamp(50px, 6vw, 90px)",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.7,
      }}
    >
      <g opacity={0.35}>
        <polygon points="20,80 40,60 40,100" fill={ORANGE} />
        <polygon points="20,180 40,160 40,200" fill={GREEN} />
        <polygon points="20,300 40,280 40,320" fill={ORANGE} />
        <polygon points="20,420 40,400 40,440" fill={GREEN} />
        <polygon points="20,560 40,540 40,580" fill={ORANGE} />
        <polygon points="20,700 40,680 40,720" fill={GREEN} />
      </g>
      <g opacity={0.22} strokeWidth={1.5} fill="none">
        <line x1="50" y1="40" x2="70" y2="40" stroke={ORANGE} />
        <line x1="50" y1="240" x2="70" y2="240" stroke={GREEN} />
        <line x1="50" y1="480" x2="70" y2="480" stroke={ORANGE} />
        <line x1="50" y1="640" x2="70" y2="640" stroke={GREEN} />
      </g>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Right-side strip — small alternating green/orange triangles.
   ──────────────────────────────────────────────────────────────────── */

export function SideRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 800"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: 0,
        width: "clamp(50px, 6vw, 90px)",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.7,
      }}
    >
      <g opacity={0.35}>
        <polygon points="40,120 60,100 60,140" fill={GREEN} />
        <polygon points="40,240 60,220 60,260" fill={ORANGE} />
        <polygon points="40,360 60,340 60,380" fill={GREEN} />
        <polygon points="40,500 60,480 60,520" fill={ORANGE} />
        <polygon points="40,640 60,620 60,660" fill={GREEN} />
      </g>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Combined BackgroundArt — the SAFAI-style fixed bg-art layer.
   Use as the first child inside the hero wrapper. The grain overlay
   provides the warm/cool glow.
   ──────────────────────────────────────────────────────────────────── */

export function BackgroundArt() {
  return (
    <div className="bg-art" aria-hidden>
      <CornerTL />
      <CornerBR />
      <SideLeft />
      <SideRight />
      <div className="bg-art__grain" />
    </div>
  );
}
