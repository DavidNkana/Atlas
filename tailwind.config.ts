import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Atlas dark theme tokens
        // Day 1: two surfaces (page, card) and an accent.
        // Week 2 will add signal-confidence colors.
        // Sep 2026 MVP rebuild: Ndebele-inspired accent palette —
        // warm orange + earthy green, no indigo/blue.
        atlas: {
          bg: "#0a0a0b",
          surface: "#141416",
          surface2: "#1c1c1f",
          border: "#27272a",
          text: "#fafafa",
          muted: "#a1a1aa",
          // Primary accent — Ndebele warm orange (clay-earth tone)
          accent: "#ea7a1f",
          accent2: "#f59e3d",
          // Secondary accent — Ndebele green (vegetation, growth)
          green: "#3f8d4e",
          green2: "#5cb568",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // Ndebele geometric pattern background images, defined inline so
      // Tailwind can compose them with `bg-pattern-zigzag` etc.
      backgroundImage: {
        // (none here — patterns are SVG components, not Tailwind
        // background-images. Keeps bundle smaller.)
      },
    },
  },
  plugins: [],
};

export default config;
