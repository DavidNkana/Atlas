"use client";

/**
 * Atlas — Onboarding (Day 21).
 *
 * 4-step profile capture after Clerk signup. User lands here from the
 * home page redirect (app/page.tsx checks user.onboardingComplete and
 * sends us here on first authed visit).
 *
 * Steps:
 *   1. Where are you based?              (location — free text)
 *   2. Individual or organization?       (accountType — radio)
 *      → If organization: organization name (text)
 *   3. What brings you to Atlas?         (intent — radio)
 *   4. Where did you hear about us from? (referralSource — select)
 *
 * All steps are skippable — there's a "Skip for now" link in the
 * header and the submit button on the last step is labelled
 * "Finish — or skip". Submitting with everything blank still flips
 * onboardingComplete to true so the user doesn't see this form again.
 *
 * Styling: Atlas dark theme (bg-atlas-bg / bg-atlas-surface /
 * text-atlas-text / text-atlas-muted / border-atlas-border /
 * bg-atlas-accent) — same tokens as the sign-in/sign-up pages.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtlasLogo } from "@/components/AtlasLogo";

type AccountType = "individual" | "organization";
type Intent =
  | "invest"
  | "develop"
  | "rent"
  | "board"
  | "research"
  | "other";
type ReferralSource =
  | "google"
  | "social_media"
  | "friend"
  | "article"
  | "event"
  | "other";

const INTENT_OPTIONS: { value: Intent; label: string; description: string }[] = [
  {
    value: "invest",
    label: "Find a place to invest in",
    description: "Buy investment property — residential, commercial, or land.",
  },
  {
    value: "develop",
    label: "Develop or build on land",
    description: "Land developers, residential builders, commercial developers.",
  },
  {
    value: "rent",
    label: "Find a place to rent",
    description: "Homes, apartments, long-term residential lets.",
  },
  {
    value: "board",
    label: "Find student / boarding accommodation",
    description: "Students, parents, boarders looking for student housing.",
  },
  {
    value: "research",
    label: "Research a market or location",
    description: "Analysts, journalists, students studying a property market.",
  },
  {
    value: "other",
    label: "Something else",
    description: "Tell us more on the dashboard later.",
  },
];

const REFERRAL_OPTIONS: { value: ReferralSource; label: string }[] = [
  { value: "google", label: "Google search" },
  { value: "social_media", label: "Social media (LinkedIn, X, Facebook, etc.)" },
  { value: "friend", label: "Friend or colleague" },
  { value: "article", label: "Article or blog post" },
  { value: "event", label: "Event or meetup" },
  { value: "other", label: "Other" },
];

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form state.
  const [location, setLocation] = useState<string>("");
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [organizationName, setOrganizationName] = useState<string>("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [referralSource, setReferralSource] = useState<ReferralSource | "">("");

  const stepIsValid = (n: number): boolean => {
    if (n === 1) return true; // location is free text, always valid
    if (n === 2) {
      // accountType must be chosen; orgName required if organization
      if (accountType === null) return false;
      if (accountType === "organization" && organizationName.trim().length === 0) {
        return false;
      }
      return true;
    }
    if (n === 3) return intent !== null;
    if (n === 4) return true; // referralSource is optional
    return true;
  };

  async function submit(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Save failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  function next() {
    if (!stepIsValid(step)) return;
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      // Final step — submit everything we have (even if mostly empty).
      void submit({
        location: location.trim() || undefined,
        accountType: accountType ?? undefined,
        organizationName:
          accountType === "organization" ? organizationName.trim() : undefined,
        intent: intent ?? undefined,
        referralSource: referralSource || undefined,
      });
    }
  }

  function back() {
    if (step > 1) setStep(step - 1);
  }

  async function skipAll() {
    await submit({ skip: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-atlas-bg px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header: logo + skip */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AtlasLogo size={32} />
            <span className="text-sm font-medium text-atlas-muted">
              Welcome to Atlas
            </span>
          </div>
          <button
            type="button"
            onClick={() => void skipAll()}
            disabled={submitting}
            className="text-xs text-atlas-muted hover:text-atlas-text disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-atlas-muted">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-atlas-border">
            <div
              className="h-full bg-atlas-accent transition-all"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-atlas-border bg-atlas-surface p-6">
          {step === 1 && (
            <Step1
              location={location}
              setLocation={setLocation}
            />
          )}
          {step === 2 && (
            <Step2
              accountType={accountType}
              setAccountType={setAccountType}
              organizationName={organizationName}
              setOrganizationName={setOrganizationName}
            />
          )}
          {step === 3 && (
            <Step3
              intent={intent}
              setIntent={setIntent}
            />
          )}
          {step === 4 && (
            <Step4
              referralSource={referralSource}
              setReferralSource={setReferralSource}
            />
          )}

          {error && (
            <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={step === 1 || submitting}
              className="rounded-md border border-atlas-border bg-atlas-bg px-4 py-2 text-xs font-medium text-atlas-text transition hover:border-atlas-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!stepIsValid(step) || submitting}
              className="rounded-md bg-atlas-accent px-5 py-2 text-xs font-medium text-white transition hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Saving..."
                : step === TOTAL_STEPS
                  ? "Finish"
                  : "Next"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/* Step components — inline to keep this file self-contained           */
/* ────────────────────────────────────────────────────────────────── */

function Step1({
  location,
  setLocation,
}: {
  location: string;
  setLocation: (v: string) => void;
}) {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-atlas-text">
        Where are you based?
      </h1>
      <p className="mb-4 text-xs text-atlas-muted">
        City and country is enough. We use this to surface local market
        signals by default.
      </p>
      <input
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="e.g. Cape Town, South Africa"
        maxLength={200}
        autoFocus
        className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted/60 focus:border-atlas-accent focus:outline-none"
      />
    </div>
  );
}

function Step2({
  accountType,
  setAccountType,
  organizationName,
  setOrganizationName,
}: {
  accountType: AccountType | null;
  setAccountType: (v: AccountType | null) => void;
  organizationName: string;
  setOrganizationName: (v: string) => void;
}) {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-atlas-text">
        Are you an individual or organization?
      </h1>
      <p className="mb-4 text-xs text-atlas-muted">
        Pick whichever applies — it helps us tailor the experience.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["individual", "organization"] as const).map((opt) => (
          <button
            type="button"
            key={opt}
            onClick={() => setAccountType(opt)}
            className={`rounded-md border px-4 py-3 text-left text-sm transition ${
              accountType === opt
                ? "border-atlas-accent bg-atlas-accent/10 text-atlas-text"
                : "border-atlas-border bg-atlas-surface2 text-atlas-muted hover:border-atlas-accent hover:text-atlas-text"
            }`}
          >
            <div className="font-medium">
              {opt === "individual" ? "Individual" : "Organization"}
            </div>
            <div className="mt-0.5 text-[11px] text-atlas-muted">
              {opt === "individual"
                ? "Personal use"
                : "Company, fund, or team"}
            </div>
          </button>
        ))}
      </div>
      {accountType === "organization" && (
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-atlas-text">
            Organization name
          </label>
          <input
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="e.g. Acme Property Holdings"
            maxLength={200}
            autoFocus
            className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted/60 focus:border-atlas-accent focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function Step3({
  intent,
  setIntent,
}: {
  intent: Intent | null;
  setIntent: (v: Intent | null) => void;
}) {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-atlas-text">
        What brings you to Atlas?
      </h1>
      <p className="mb-4 text-xs text-atlas-muted">
        Pick the one that fits best. Atlas works for investors, developers,
        renters, students, and researchers.
      </p>
      <div className="space-y-2">
        {INTENT_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => setIntent(opt.value)}
            className={`block w-full rounded-md border px-4 py-3 text-left transition ${
              intent === opt.value
                ? "border-atlas-accent bg-atlas-accent/10 text-atlas-text"
                : "border-atlas-border bg-atlas-surface2 text-atlas-muted hover:border-atlas-accent hover:text-atlas-text"
            }`}
          >
            <div className="text-sm font-medium">{opt.label}</div>
            <div className="mt-0.5 text-[11px] text-atlas-muted">
              {opt.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step4({
  referralSource,
  setReferralSource,
}: {
  referralSource: ReferralSource | "";
  setReferralSource: (v: ReferralSource | "") => void;
}) {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-atlas-text">
        Where did you hear about us?
      </h1>
      <p className="mb-4 text-xs text-atlas-muted">
        Helps us know what's working. Optional but appreciated.
      </p>
      <div className="relative">
        <select
          value={referralSource}
          onChange={(e) =>
            setReferralSource(e.target.value as ReferralSource | "")
          }
          className="w-full appearance-none rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 pr-10 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            backgroundSize: "1rem",
          }}
        >
          <option value="">— Select one (optional) —</option>
          {REFERRAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-[11px] text-atlas-muted">
        Atlas is in private beta. Your answers help us prioritize what to
        build next.
      </p>
    </div>
  );
}
