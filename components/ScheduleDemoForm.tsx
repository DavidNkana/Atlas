"use client";

import { useState } from "react";

/**
 * Day 13 — Schedule Demo form.
 *
 * Replaces the "Get a demo" mailto: link with a real inline form.
 * Posts to /api/demo-request, which:
 *   1. Persists the lead to Supabase (WaitlistSignup table)
 *   2. Emails davidnkana74@gmail.com with the request
 *
 * The user sees a success state with a thank-you message.
 * On error we show a useful message + their email so they
 * have a fallback.
 *
 * The optional `questionContext` field surfaces what the user
 * was asking about on Atlas before requesting a demo — David
 * can prep for the call with that context.
 */
export function ScheduleDemoForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("land_developer");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company,
          role,
          message: message || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || `Request failed (${res.status})`);
        return;
      }
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Network error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-emerald-700 bg-emerald-500/10 p-6 text-left">
        <h3 className="mb-2 text-lg font-semibold text-emerald-300">
          Thanks, {name || "we got it"}!
        </h3>
        <p className="text-sm text-emerald-200">
          Your demo request is in. David will email you within 1
          business day to schedule a 30-minute call. In the
          meantime, try the live Atlas at{" "}
          <a
            href="/"
            className="underline underline-offset-2 hover:text-emerald-100"
          >
            atlas-q2eh.vercel.app
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-left">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Your name"
          value={name}
          onChange={setName}
          required
          placeholder="David Nkana"
        />
        <Field
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          placeholder="david@yourcompany.com"
        />
        <Field
          label="Company"
          value={company}
          onChange={setCompany}
          required
          placeholder="Acme Properties"
        />
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
          >
            <option value="land_developer">Land developer</option>
            <option value="property_investor">Property investor</option>
            <option value="residential_builder">Residential builder</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
          What do you want to see? (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="E.g. I want to evaluate 10 sites/week in Cape Town for residential development. Can Atlas show me schools + property prices + foot traffic in one view?"
          className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none"
        />
      </div>
      {status === "error" && (
        <div className="rounded-md border border-rose-700 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <strong>Couldn't send:</strong> {errorMsg}
          <div className="mt-1 text-rose-300/80">
            Email <a href="mailto:david@atlas.local" className="underline">david@atlas.local</a> directly if this keeps failing.
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === "submitting" || !name || !email || !company}
          className="rounded-md bg-atlas-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Sending…" : "Request a demo"}
        </button>
        <a
          href="mailto:david@atlas.local?subject=Atlas%20demo%20request"
          className="text-xs text-atlas-muted underline-offset-2 hover:text-atlas-accent hover:underline"
        >
          or email directly
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
        {label}
        {required && <span className="text-rose-400"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none"
      />
    </div>
  );
}
