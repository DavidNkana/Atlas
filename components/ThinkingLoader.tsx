"use client";

/**
 * Atlas — Thinking loader.
 *
 * Shown while /api/ask is in-flight. Three animated dots, brand color,
 * a label that rotates through the stages of the pipeline:
 *   1. "Atlas is reading your question"
 *   2. "Atlas is planning which signals to fetch"
 *   3. "Atlas is fetching real data"
 *   4. "Atlas is scoring and ranking"
 *   5. "Atlas is writing the answer"
 *
 * The whole thing is a Client Component so we can animate and cycle
 * the label. No external deps — pure Tailwind keyframes.
 */

import { useEffect, useState } from "react";

const STAGES = [
  "Atlas is reading your question",
  "Atlas is planning which signals to fetch",
  "Atlas is fetching real data",
  "Atlas is scoring and ranking",
  "Atlas is writing the answer",
];

export function ThinkingLoader() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStage((s) => (s + 1) % STAGES.length);
    }, 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-atlas-accent"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <p
        key={stage}
        className="animate-pulse text-sm font-medium text-atlas-text"
      >
        {STAGES[stage]}
      </p>
      <p className="text-xs text-atlas-muted">
        Blending AI with multiple data sources
      </p>
    </div>
  );
}
