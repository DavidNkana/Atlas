"use client";

/**
 * Atlas — Model icon.
 *
 * Renders the brand-color SVG path for a ModelInfo. Used in:
 *   - Sidebar (the user-pill future profile menu)
 *   - Settings drawer
 *   - Model picker (instead of the current text-only dropdown)
 *
 * The SVG is a simplified 24x24 mark. The icon inherits `currentColor`
 * from the wrapper so we can tint with the model's brandColor.
 */

import type { ModelInfo } from "@/lib/models/types";

export function ModelIcon({
  info,
  size = 16,
  className = "",
}: {
  info: ModelInfo;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: `${info.brandColor}1a`, // ~10% alpha fill
        color: info.brandColor,
      }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.65)}
        height={Math.round(size * 0.65)}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={info.logoPath} />
      </svg>
    </span>
  );
}
