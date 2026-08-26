"use client";

/**
 * Atlas — ChatGPT-style thinking loader.
 *
 * Day 9 polish + Day 22 redesign. While Atlas is fetching data,
 * this component shows a sequence of pre-written multi-line
 * paragraphs that "type out" word-by-word in prose register,
 * personalised with the user's first name, their question, and
 * the selected vertical ("Alright David. I got your question —
 * 'Where in Sandton for vacant land?' Let me think this through
 * for you.").
 *
 * Day 22 visual upgrade:
 *   - Bigger, more visible dots (h-3 w-3 instead of h-1.5 w-1.5)
 *     with a bouncier staggered animation (scale + opacity)
 *   - Bigger text (text-xl instead of text-sm) for legibility
 *   - Rounded geometric sans-serif font stack: ui-rounded,
 *     "SF Pro Rounded", "Nunito", system-ui. These are rounded
 *     typefaces that ship with the OS — no web font dep.
 *   - Each paragraph is now personalised with the user's prompt
 *     in quotes so the user sees Atlas acknowledge their exact
 *     question before doing any work.
 *
 * The lines are personalised with the user's first name, their
 * question, and the selected vertical. Each line types out
 * word-by-word (faster and smoother than letter-by-letter), holds
 * for a moment, then fades out and the next line fades in. When
 * the sequence ends, it loops back to the first line so the user
 * always sees motion.
 *
 * Implementation:
 *   - A pool of 6 paragraphs. We pick all 6 per render (they're
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
  vertical: string;
  cityName?: string | null;
  onDone?: () => void;
}

function buildParagraphs(opts: {
  firstName: string | null;
  question: string;
  vertical: string;
  cityName: string | null | undefined;
}): string[] {
  const name = opts.firstName || "there";
  const q = opts.question.trim();
  const qShort = q.length > 60 ? q.slice(0, 60).trim() + "…" : q;
  const v = opts.vertical.replace(/_/g, " ");
  const city = opts.cityName || "your area";

  // 5 paragraphs in ChatGPT register. Each one is a full thought,
  // not a fragment. The user gets the feeling of a real AI working
  // through the problem step by step.
  return [
    `Alright ${name} — got your question: "${qShort}". Let me think through this for you.`,
    `Mapping ${city} for a ${v} now. Pulling in the relevant signals — POI density, road access, competition.`,
    `Cross-checking with demographics and recent activity in the area. Don't want to guess on geography alone.`,
    `Filtering for environmental constraints — flood plains, protected land, industrial hazards. Quick.`,
    `Ranking the top candidates by traffic, access, and demand. Almost there.`,
    `Final pass — drafting the answer with a clear rationale for each of the top sites.`,
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
      // Type out the next word. Slightly faster than letter-by-letter,
      // reads more like ChatGPT's natural cadence. Tuned for the
      // bigger text — a touch slower per word feels deliberate.
      const t = setTimeout(() => {
        setWordCount((c) => c + 1);
      }, 65);
      return () => clearTimeout(t);
    }
    if (!fading) {
      // Hold the completed paragraph on screen briefly, then
      // start fading.
      const t = setTimeout(() => setFading(true), 1600);
      return () => clearTimeout(t);
    }
    // After fade-out completes, advance to the next paragraph.
    const t = setTimeout(() => {
      setFading(false);
      setWordCount(0);
      setPIdx((i) => i + 1);
    }, 320);
    return () => clearTimeout(t);
  }, [pIdx, wordCount, fading, paragraphs, onDone]);

  const current = paragraphs[Math.min(pIdx, paragraphs.length - 1)];
  const words = current.split(/\s+/);
  const visible = words.slice(0, wordCount).join(" ");

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex items-center gap-3 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="atlas-thinking-dot inline-block h-3 w-3 rounded-full bg-atlas-accent shadow-[0_0_12px_rgba(99,102,241,0.6)]"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </div>
      <p
        className={`min-h-[6rem] max-w-2xl px-2 text-center text-xl font-medium leading-relaxed text-atlas-text transition-opacity duration-300 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
        style={{
          fontFamily:
            '"SF Pro Rounded", "Nunito", "Quicksand", ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif',
          letterSpacing: "0.005em",
        }}
      >
        {visible}
        {wordCount < words.length && (
          <span className="ml-1 inline-block h-5 w-1 animate-pulse bg-atlas-accent align-middle" />
        )}
      </p>
    </div>
  );
}
