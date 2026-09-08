import { CryptoDashboard } from "@/components/CryptoDashboard";

/**
 * Day 26 — Crypto markets page.
 *
 * First investor-facing surface for Atlas's crypto wedge.
 * Investors get: top 50 coins by market cap, 24h movers,
 * African on-ramp exchanges (Luno, VALR, Yellow Card, Quidax,
 * Bitnob, Noah).
 *
 * Data flows via /api/crypto/feed (server route) so the client
 * bundle never reads env directly.
 */

export const metadata = {
  title: "Crypto Markets — Atlas",
  description:
    "Top cryptocurrencies by market cap, 24-hour movers, and African on-ramp exchanges. For African builders and investors.",
};

export const dynamic = "force-dynamic";

export default function CryptoPage() {
  return (
    <main className="min-h-screen bg-atlas-bg px-4 pb-12 pt-6 text-atlas-text">
      <CryptoDashboard />
    </main>
  );
}
