"use client";

/**
 * Day 12 v7: ThemeBootstrapper.
 *
 * The Sidebar component reads localStorage prefs and applies the
 * theme (dark / light / system) as a class on <html>. But the
 * Sidebar only mounts on pages wrapped in AppShell. Pages outside
 * the shell (sign-in, sign-up) would flash the default dark theme
 * before the user signs in and lands on a shell page.
 *
 * This component is mounted at the root layout level so it runs
 * on EVERY page (signed in or not) and applies the theme BEFORE
 * the first paint. It only writes to <html>'s class list; it
 * doesn't manage the prefs themselves — Sidebar's SettingsDrawer
 * is still the single source of truth for the user's choice.
 */
import { useEffect } from "react";
import { readPrefs, type AtlasPrefs } from "./SettingsDrawer";

function applyTheme(theme: AtlasPrefs["theme"]) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "dark") {
    html.classList.add("dark");
    html.classList.remove("atlas-light");
  } else if (theme === "light") {
    html.classList.remove("dark");
    html.classList.add("atlas-light");
  } else {
    // system
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      html.classList.add("dark");
      html.classList.remove("atlas-light");
    } else {
      html.classList.remove("dark");
      html.classList.add("atlas-light");
    }
  }
}

export function ThemeBootstrapper() {
  useEffect(() => {
    const loaded = readPrefs();
    applyTheme(loaded.theme);
    // Also listen for changes to the OS color scheme when the user
    // is on "system" — flipping the OS light/dark at 9pm should
    // update Atlas without a refresh.
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      loaded.theme === "system"
    ) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => applyTheme("system");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, []);
  return null;
}
