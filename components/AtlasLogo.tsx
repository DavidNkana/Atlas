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
        d="M16 6L19 13L26 16L19 19L16 26L13 19L6 16L13 13L16 6Z"
        fill="white"
        fillOpacity="0.95"
      />
      <circle cx="16" cy="16" r="2.5" fill="white" />
    </svg>
  );
}
