"use client";

/**
 * Atlas — ChatGPT-style thinking loader.
 *
 * Day 9 polish. While Atlas is fetching data, this component shows
 * a sequence of pre-written multi-line paragraphs that "type out"
 * word-by-word in prose register ("Alright, let's map this out. I
 * need to find sites in Sandton for a gas station...").
 *
 * The lines are personalised with the user's first name, their
 * question, and the selected vertical. Each line types out
 * word-by-word (faster and smoother than letter-by-letter), holds
 * for a moment, then fades out and the next line fades in. When
 * the sequence ends, it loops back to the first line so the user
 * always sees motion.
 *
 * Implementation:
 *   - A pool of 5 paragraphs. We pick all 5 per render (they're
 *     short enough).
 *   - Each paragraph is revealed 1 word at a time at ~80ms/word.
 *   - After a paragraph finishes, hold for 1.6s, then fade out
 *     (300ms opacity transition) and start the next one.
 *
 * No external deps. Pure React + a setInterval/timeout state
 * machine.
 */

import { useEffect, useState } from "react";

interface ThinkingLoaderProps {
  firstName: string | null;
  question: string;
  // Day 19 v3: vertical is optional now. The home page no longer
  // picks a vertical — chat handles everything.
  vertical?: string;
  cityName?: string | null;
  onDone?: () => void;
}

function buildParagraphs(opts: {
  firstName: string | null;
  question: string;
  vertical?: string;
  cityName: string | null | undefined;
}): string[] {
  const name = opts.firstName || "there";
  const q = opts.question.trim();
  const qShort = q.length > 60 ? q.slice(0, 60).trim() + "…" : q;
  const v = (opts.vertical ?? "your question").replace(/_/g, " ");
  const city = opts.cityName || "your area";

  // 5 paragraphs in ChatGPT register. Each one is a full thought,
  // not a fragment. The user gets the feeling of a real AI working
  // through the problem step by step.
  return [
    `Alright ${name}. I got your question — "${qShort}". Let me think this through for you.`,
    `First, I need to find the right sites in ${city} for a ${v}. I'll start by mapping the area and pulling in the relevant signals.`,
    `Next, I'll check live POI density — what else is nearby that matters for a ${v}, and how busy the surrounding streets actually are.`,
    `Then I'll layer in demographics and recent real estate activity, so I'm not just guessing based on geography.`,
    `Almost there. I'm cross-referencing the strongest candidates and ranking them by traffic, access, and demand.`,
    `Final pass — drafting the answer with scores and a clear rationale for each of the top 5 sites.`,
  ];
}

export function ChatGPTThinking({
  firstName,
  question,
  vertical,
  cityName,
  onDone,
}: ThinkingLoaderProps) {
  const paragraphs = buildParagraphs({ firstName, question, vertical, cityName });
  const [pIdx, setPIdx] = useState<number>(0);
  const [wordCount, setWordCount] = useState<number>(0);
  const [fading, setFading] = useState<boolean>(false);

  useEffect(() => {
    if (pIdx >= paragraphs.length) {
      // Loop back to start so the user always sees motion.
      setPIdx(0);
      setWordCount(0);
      return;
    }
    const words = paragraphs[pIdx].split(/\s+/);
    if (wordCount < words.length) {
      // Type out the next word. Faster than letter-by-letter,
      // reads more like ChatGPT's natural cadence.
      const t = setTimeout(() => {
        setWordCount((c) => c + 1);
      }, 80);
      return () => clearTimeout(t);
    }
    if (!fading) {
      // Hold the completed paragraph on screen briefly, then
      // start fading.
      const t = setTimeout(() => setFading(true), 1800);
      return () => clearTimeout(t);
    }
    // After fade-out completes, advance to the next paragraph.
    const t = setTimeout(() => {
      setFading(false);
      setWordCount(0);
      setPIdx((i) => i + 1);
    }, 350);
    return () => clearTimeout(t);
  }, [pIdx, wordCount, fading, paragraphs, onDone]);

  const current = paragraphs[Math.min(pIdx, paragraphs.length - 1)];
  const words = current.split(/\s+/);
  const visible = words.slice(0, wordCount).join(" ");

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
      <p
        className={`min-h-[4.5rem] max-w-lg text-sm leading-relaxed text-atlas-text transition-opacity duration-300 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        {visible}
        {wordCount < words.length && (
          <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-atlas-accent align-middle" />
        )}
      </p>
    </div>
  );
}
