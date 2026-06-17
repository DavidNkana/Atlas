"use client";

/**
 * Atlas — Streaming thinking text.
 *
 * Day 8 polish v3. While Atlas is fetching data, this component shows
 * a sequence of pre-written lines (personalised with the user's
 * first name + their question) that "type out" letter by letter,
 * ChatGPT-style.
 *
 * Each line stays on screen for a moment after typing completes, then
 * the next line replaces it. When the sequence ends, it loops back
 * to the first line so the user always sees motion.
 *
 * Implementation:
 *   - A pool of templates. We pick 3-4 lines per render based on the
 *     user's name + question + vertical.
 *   - Each line types out at ~28ms/char (fast but readable).
 *   - After a line finishes, hold for 1.2s, then erase the line at
 *     ~12ms/char (faster than typing), then start the next line.
 *
 * No external deps. Pure React + a setInterval/timeout state
 * machine.
 */

import { useEffect, useState } from "react";

const STAGE_LINES = [
  "Reading your question",
  "Picking the right signals to fetch",
  "Querying OpenStreetMap for nearby amenities",
  "Checking demographic data for the area",
  "Cross-referencing recent real estate listings",
  "Ranking candidates by traffic + access + demographics",
  "Drafting the answer",
];

function pickLines(opts: {
  firstName: string | null;
  question: string;
  vertical: string;
}): string[] {
  const name = opts.firstName || "there";
  const q = opts.question.trim();
  const v = opts.vertical.replace(/_/g, " ");
  // Build a small set of personalised lines. The user gets variety
  // across questions.
  const base = [
    `Alright ${name}, let me think about "${q.length > 40 ? q.slice(0, 40) + "…" : q}".`,
    `I'll look for the best spots for a ${v}.`,
    `Querying multiple data sources — POI density, demographics, and recent listings.`,
    `Cross-referencing the strongest candidates now.`,
    `I have 5 candidates that look strong. Ranking them by traffic, access, and demand.`,
    `Finalising the answer with scores and rationale for each site.`,
  ];
  // Rotate based on the question text so the same prompt doesn't
  // produce the same lines every time.
  const seed = Array.from(q).reduce((a, c) => a + c.charCodeAt(0), 0);
  const rotated = [...base];
  for (let i = 0; i < (seed % base.length); i++) {
    rotated.push(rotated.shift()!);
  }
  return rotated;
}

export function StreamingThinking({
  firstName,
  question,
  vertical,
  onDone,
}: {
  firstName: string | null;
  question: string;
  vertical: string;
  onDone?: () => void;
}) {
  const lines = pickLines({ firstName, question, vertical });
  const [lineIdx, setLineIdx] = useState<number>(0);
  const [displayed, setDisplayed] = useState<string>("");
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing">(
    "typing"
  );

  useEffect(() => {
    if (lineIdx >= lines.length) {
      // Loop back to the start so the user always sees motion.
      setLineIdx(0);
      return;
    }
    const full = lines[lineIdx];
    if (phase === "typing") {
      if (displayed.length < full.length) {
        const t = setTimeout(() => {
          setDisplayed(full.slice(0, displayed.length + 1));
        }, 28);
        return () => clearTimeout(t);
      } else {
        // Done typing. Hold for a moment.
        const t = setTimeout(() => setPhase("erasing"), 1400);
        return () => clearTimeout(t);
      }
    } else if (phase === "erasing") {
      if (displayed.length > 0) {
        const t = setTimeout(() => {
          setDisplayed(displayed.slice(0, -1));
        }, 12);
        return () => clearTimeout(t);
      } else {
        // Move to next line.
        setLineIdx((i) => i + 1);
        setPhase("typing");
      }
    } else {
      const t = setTimeout(() => setPhase("erasing"), 1400);
      return () => clearTimeout(t);
    }
  }, [displayed, phase, lineIdx, lines, onDone]);

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-atlas-accent"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <p className="min-h-[3rem] max-w-md text-sm leading-relaxed text-atlas-text">
        {displayed}
        <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-atlas-accent align-middle" />
      </p>
    </div>
  );
}
