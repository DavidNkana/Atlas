"use client";

import { useEffect, useState } from "react";

const MOATS = [
  "AI operating system for builders + investors.",
  "Africa's living map of real movement.",
  "Sites from real signals, not guesses.",
  "Decision memory that compounds.",
  "Bold ideas into buildable sites.",
] as const;

const TYPE_DELAY = 42;
const DELETE_DELAY = 24;
const HOLD_DELAY = 1_800;
const BETWEEN_DELAY = 450;

export function TypewriterMoat() {
  const [text, setText] = useState<string>("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setText(MOATS[0]);
      return;
    }

    let phraseIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const phrase = MOATS[phraseIndex];

      if (!deleting) {
        characterIndex += 1;
        setText(phrase.slice(0, characterIndex));

        if (characterIndex === phrase.length) {
          deleting = true;
          timeoutId = setTimeout(tick, HOLD_DELAY);
          return;
        }
      } else {
        characterIndex -= 1;
        setText(phrase.slice(0, characterIndex));

        if (characterIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % MOATS.length;
          timeoutId = setTimeout(tick, BETWEEN_DELAY);
          return;
        }
      }

      timeoutId = setTimeout(tick, deleting ? DELETE_DELAY : TYPE_DELAY);
    };

    timeoutId = setTimeout(tick, TYPE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [reducedMotion]);

  return (
    <div>
      <p className="flex h-14 items-center justify-center text-base leading-6 tracking-tight text-atlas-muted sm:h-14 sm:text-xl sm:leading-7 sm:tracking-normal" aria-hidden="true">
        {reducedMotion ? MOATS[0] : text}
      </p>
      <p className="sr-only">Atlas moat statements: {MOATS.join(" ")}</p>
    </div>
  );
}
