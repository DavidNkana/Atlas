"use client";

/**
 * Atlas — brand mark.
 *
 * The Atlas logo: a 4-pointed compass star inside a circle, indicating
 * "find your way" / "navigate". Used in:
 *   - Sidebar top
 *   - favicon
 *   - /demo hero
 *
 * Brand color: indigo (#6366F1).
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
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="atlas-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818CF8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="8" fill="url(#atlas-grad)" />
      <path
        d="M16 2C10.48 2 6 6.48 6 12c0 7.42 10 18 10 18s10-10.58 10-18c0-5.52-4.48-10-10-10zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"
        fill="white"
        fillOpacity="0.95"
      />
    </svg>
  );
}
