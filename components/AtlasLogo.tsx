"use client";

/**
 * Atlas — brand mark.
 *
 * Uses the transparent AI.png brand mark so the logo stays readable
 * without a colored tile in either theme.
 */
export function AtlasLogo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative z-10 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/AI.png"
        alt="Atlas"
        width={size - 8}
        height={size - 8}
        className="atlas-logo-mark object-contain"
      />
    </div>
  );
}
