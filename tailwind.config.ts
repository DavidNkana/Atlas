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
        atlas: {
          bg: "#0a0a0b",
          surface: "#141416",
          surface2: "#1c1c1f",
          border: "#27272a",
          text: "#fafafa",
          muted: "#a1a1aa",
          accent: "#6366f1", // indigo-500 — Atlas brand color
          accent2: "#818cf8", // indigo-400
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
