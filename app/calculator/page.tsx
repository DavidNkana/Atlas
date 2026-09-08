import { AppShell } from "@/components/AppShell";
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
    <AppShell patterned>
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
