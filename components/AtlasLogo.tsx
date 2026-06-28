"use client";

/**
 * Atlas — brand mark.
 *
 * Uses AI.png with a blue rounded background for visibility
 * in both light and dark modes.
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
      className={`flex items-center justify-center rounded-lg bg-[#4F46E5] ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/AI.png"
        alt="Atlas"
        width={size - 8}
        height={size - 8}
        className="object-contain"
      />
    </div>
  );
}
