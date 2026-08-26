import { AppShell } from "@/components/AppShell";
import { AtlasLogo } from "@/components/AtlasLogo";
import Link from "next/link";
import CalculatorClient from "./CalculatorClient";

/**
 * Atlas — Free Tools: Property Investment Calculator (Day 26).
 *
 * Server-component shell that wraps CalculatorClient (a client
 * component that handles all 4 tabs and their interactive state).
 *
 * Four calculators in one — affordability, buy-to-let yield,
 * ROI projection, and SA transfer costs. Modeled on
 * propertyai.co.za/calculator.
 */

export const metadata = {
  title: "Free Tools — Property Investment Calculator | Atlas",
  description:
    "Bond affordability, buy-to-let yield, ROI projection, and SA transfer cost calculators. Free to use, no sign-in required.",
};

export default function CalculatorPage() {
  return (
    <AppShell>
      <header className="flex items-center justify-between border-b border-atlas-border px-6 py-4">
        <div className="flex items-center gap-3">
          <AtlasLogo size={24} />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
              Property Investment Calculator
            </h1>
            <p className="text-[11px] text-atlas-muted">
              Four tools in one — affordability, cash flow, ROI
              projections, and SA transfer costs.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
        >
          ← Back
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <CalculatorClient />
      </main>

      <footer className="mt-auto px-6 py-6 text-center text-xs text-atlas-muted">
        <p>
          Atlas · {new Date().getFullYear()} · Free tools — no sign-in
          required.
        </p>
      </footer>
    </AppShell>
  );
}
