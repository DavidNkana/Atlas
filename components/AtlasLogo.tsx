"use client";

/**
 * Atlas — brand mark.
 *
 * Keep the mark self-contained and transparent: the header owns its glass
 * surface, while the brand stays legible on both dark and light shells.
 */
export function AtlasLogo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Atlas"
    >
      <path d="M16 2 20.2 11.8 30 16l-9.8 4.2L16 30l-4.2-9.8L2 16l9.8-4.2L16 2Z" fill="url(#atlas-mark)" />
      <circle cx="16" cy="16" r="3" fill="#fff" fillOpacity=".95" />
      <defs>
        <linearGradient id="atlas-mark" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff9a4d" />
          <stop offset="1" stopColor="#3f8d4e" />
        </linearGradient>
      </defs>
    </svg>
  );
}
