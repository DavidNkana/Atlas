"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AtlasLogo } from "@/components/AtlasLogo";

const CITIES = [
  "Sandton", "Johannesburg", "Pretoria", "Cape Town", "Durban",
  "Stellenbosch", "Bloemfontein", "Port Elizabeth", "East London",
  "Lusaka", "Kitwe", "Ndola", "Nairobi", "Mombasa",
];

const SOURCES = [
  { id: "property24", name: "Property24" },
  { id: "privateproperty", name: "Private Property" },
];

export default function AgentsPage() {
  const [city, setCity] = useState("Sandton");
  const [sources, setSources] = useState<string[]>(["property24", "privateproperty"]);
  const [scraping, setScraping] = useState(false);
  const [result, setResult] = useState<{ saved: number; city: string; errors?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCount() {
      try {
        const res = await fetch("/api/agents/download?format=csv", { method: "HEAD" });
        // No HEAD on Next route; fallback to GET with small range
        const r2 = await fetch("/api/agents/download?format=csv");
        if (!r2.ok) { setCount(0); return; }
        const txt = await r2.text();
        const lines = txt.split("\n").length - 1;
        if (!cancelled) setCount(lines > 0 ? lines : 0);
      } catch { if (!cancelled) setCount(0); }
    }
    loadCount();
    return () => { cancelled = true; };
  }, []);

  async function handleScrape() {
    setScraping(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agents/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, sources }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Scrape failed");
      } else {
        setResult(data);
        setCount((c) => (c ?? 0) + (data.saved ?? 0));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setScraping(false);
    }
  }

  function toggleSource(id: string) {
    setSources((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <header className="mb-8 flex items-center justify-between border-b border-atlas-border pb-4">
          <div className="flex items-center gap-3">
            <AtlasLogo size={28} />
            <h1 className="text-xl font-semibold tracking-tight text-atlas-text">
              Atlas <span className="text-atlas-muted text-sm font-normal">· Agents</span>
            </h1>
          </div>
          <a href="/" className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs text-atlas-text hover:border-atlas-accent">
            ← Home
          </a>
        </header>

        <section className="mb-6 rounded-xl border border-atlas-border bg-atlas-surface p-6">
          <h2 className="mb-2 text-lg font-semibold text-atlas-text">Real estate agent directory</h2>
          <p className="mb-4 text-xs text-atlas-muted">
            Pulls public agent listings from Property24 and Private Property, extracts contact details, and gives you an Excel / CSV / PDF download.
            <br />
            <span className="text-amber-400">⚠</span> Note: scraping these directories may be against their ToS for commercial use. Use for personal research only.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-atlas-muted">City</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                list="cities"
                className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
                placeholder="Sandton, Cape Town, Lusaka…"
              />
              <datalist id="cities">
                {CITIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>

            <div>
              <span className="mb-1 block text-xs font-medium text-atlas-muted">Sources</span>
              <div className="flex gap-2">
                {SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSource(s.id)}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      sources.includes(s.id)
                        ? "border-atlas-accent bg-atlas-accent/15 text-atlas-accent"
                        : "border-atlas-border bg-atlas-surface2 text-atlas-muted hover:border-atlas-accent"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleScrape}
            disabled={scraping || sources.length === 0}
            className="mt-4 w-full rounded-md bg-atlas-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scraping ? "Scraping… (this may take 30-60s)" : `Scrape agents for ${city || "…"}`}
          </button>

          {error && (
            <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              ✓ Saved {result.saved} new agent{result.saved === 1 ? "" : "s"} for {result.city}.
              {result.errors && result.errors.length > 0 && (
                <div className="mt-1 text-xs text-amber-300">
                  Some sources had issues: {result.errors.join("; ")}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-atlas-border bg-atlas-surface p-6">
          <h2 className="mb-2 text-lg font-semibold text-atlas-text">Download</h2>
          <p className="mb-4 text-xs text-atlas-muted">
            {count !== null && count > 0
              ? `${count} agent${count === 1 ? "" : "s"} cached. Pick a format:`
              : "No agents cached yet. Run a scrape first."}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { fmt: "xlsx", label: "Excel (.xlsx)" },
              { fmt: "csv", label: "CSV" },
              { fmt: "pdf", label: "PDF" },
            ].map((opt) => (
              <a
                key={opt.fmt}
                href={`/api/agents/download?format=${opt.fmt}${city ? `&city=${encodeURIComponent(city)}` : ""}`}
                target="_blank"
                rel="noopener"
                className="rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-center text-xs text-atlas-text transition-colors hover:border-atlas-accent"
              >
                {opt.label}
              </a>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-atlas-border pt-6 text-center text-xs text-atlas-muted">
          <p>Atlas · {new Date().getFullYear()} · Agent directory</p>
        </footer>
      </div>
    </AppShell>
  );
}
