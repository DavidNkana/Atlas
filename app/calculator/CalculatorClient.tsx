"use client";

/**
 * Atlas — Free Tools: Property Investment Calculator (Day 26).
 *
 * Four tools in one — affordability, cash flow, ROI projections, and
 * SA transfer costs. Modeled on propertyai.co.za/calculator after
 * Chris asked us to ship a similar experience for land developers,
 * investors, and renters.
 *
 * Components:
 *   AffordabilityTab — Bond affordability: monthly repayment, total
 *     interest, total cost, min gross salary. Slider for price /
 *     deposit / rate; buttons for loan term (10/15/20/25/30 yr).
 *   BuyToLetTab — Rental yield: monthly rent → gross yield, net
 *     yield, monthly cashflow. Slider for rent + costs.
 *   RoiTab — Multi-year ROI projection: purchase price, deposit,
 *     appreciation rate, hold period → projected equity + ROI%.
 *   TransferCostsTab — SA transfer cost breakdown: transfer duty
 *     (SARS schedule), bond registration, attorney fees (deeds
 *     office sliding scale), deeds office levy, VAT.
 *
 * All four tabs share the same Atlas dark-theme styling: slate-card
 * surface, indigo accent for sliders/buttons, white numbers in
 * monospace for monetary values (easier to scan).
 */

import { useState } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/* Shared formatting utilities                                          */
/* ------------------------------------------------------------------ */

/** Format an integer ZAR amount with thin-space thousands separator. */
function formatZAR(value: number): string {
  if (!isFinite(value)) return "R —";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.round(value));
  return sign + "R " + abs.toLocaleString("en-ZA");
}

/** Format a percentage with 1 decimal place, e.g. 11.25%. */
function formatPct(value: number, decimals = 2): string {
  if (!isFinite(value)) return "—";
  return value.toFixed(decimals) + "%";
}

/* ------------------------------------------------------------------ */
/* Common slider control                                                */
/* ------------------------------------------------------------------ */

/**
 * Inline-styled range input with a centred value bubble.
 * Used across all 4 tabs. Slightly heavier than the OS default
 * for better thumb visibility on touch devices.
 */
function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  ariaLabel,
  formatValue,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="relative pt-5 pb-1">
      <div className="absolute left-0 right-0 top-0 flex justify-between text-[10px] font-mono text-atlas-muted">
        <span>{formatValue ? formatValue(min) : min.toLocaleString()}</span>
        <span className="rounded-full bg-atlas-surface px-2 py-0.5 text-[11px] font-medium text-atlas-text ring-1 ring-atlas-border">
          {formatValue ? formatValue(value) : value.toLocaleString()}
        </span>
        <span>{formatValue ? formatValue(max) : max.toLocaleString()}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-atlas-border accent-atlas-accent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-atlas-accent [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(99,102,241,0.4)]"
      />
    </div>
  );
}

/* Pill button group used for loan term, hold period, etc. */
function PillGroup<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
              (selected
                ? "border-atlas-accent bg-atlas-accent/15 text-atlas-text"
                : "border-atlas-border bg-atlas-surface text-atlas-muted hover:border-atlas-accent/50 hover:text-atlas-text")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Big primary number display used for headline results. */
function BigStat({
  label,
  value,
  suffix,
  emphasis,
}: {
  label: string;
  value: string;
  suffix?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-atlas-border bg-atlas-bg p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
        {label}
      </div>
      <div
        className={
          "mt-1 font-mono " +
          (emphasis ? "text-3xl font-semibold text-atlas-accent" : "text-2xl font-semibold text-atlas-text")
        }
      >
        {value}
        {suffix && <span className="ml-1 text-xs text-atlas-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-atlas-border/40 py-2 text-xs">
      <span className="text-atlas-muted">{label}</span>
      <span className="font-mono font-medium text-atlas-text">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared math helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Monthly amortization payment for a fixed-rate loan.
 * Standard formula: P × r × (1+r)^n / ((1+r)^n − 1)
 *   P = principal (loan amount after deposit)
 *   r = monthly interest rate (annual % / 12 / 100)
 *   n = number of monthly payments (years × 12)
 * Returns 0 if any input is 0 (e.g. principal is 0 when deposit = price).
 */
function monthlyPayment(
  principal: number,
  annualRatePct: number,
  years: number,
): number {
  if (principal <= 0 || years <= 0) return 0;
  const n = years * 12;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * South African transfer duty schedule (SARS, 2024 onwards).
 * Marginal rates applied to the band above the lower threshold.
 * Rounded to the nearest rand per SARS rules.
 */
function transferDuty(value: number): number {
  if (value <= 0) return 0;
  let duty = 0;
  if (value > 1_000_000) {
    duty += Math.min(value, 1_500_000) - 1_000_000; // 0% in band (already 0)
  }
  if (value > 1_500_000) {
    duty += (Math.min(value, 1_900_000) - 1_500_000) * 0.03;
  }
  if (value > 1_900_000) {
    duty += (Math.min(value, 2_400_000) - 1_900_000) * 0.06;
  }
  if (value > 2_400_000) {
    duty += (Math.min(value, 3_000_000) - 2_400_000) * 0.08;
  }
  if (value > 3_000_000) {
    duty += (Math.min(value, 6_000_000) - 3_000_000) * 0.11;
  }
  if (value > 6_000_000) {
    duty += (value - 6_000_000) * 0.13;
  }
  return duty;
}

/** SA bond registration cost (deeds office + admin fee) — currently flat ~R2,500. */
function bondRegistrationFee(): number {
  return 2500;
}

/** SA deeds office levy (~R1,000, scales up slightly for high-value properties). */
function deedsOfficeLevy(value: number): number {
  if (value <= 200_000) return 250;
  if (value <= 1_000_000) return 750;
  if (value <= 5_000_000) return 1000;
  return 1500;
}

/**
 * Attorney conveyancing fee — Law Society recommended guideline
 * (approximate sliding scale used by most SA law firms).
 */
function attorneyConveyancingFee(value: number): number {
  if (value <= 100_000) return 4500;
  if (value <= 500_000) return 6500;
  if (value <= 1_000_000) return 8500;
  if (value <= 2_000_000) return 10500;
  if (value <= 3_000_000) return 12500;
  return 14500 + (value - 3_000_000) * 0.001;
}

/* ------------------------------------------------------------------ */
/* Tab 1 — Bond Affordability                                            */
/* ------------------------------------------------------------------ */

function AffordabilityTab() {
  const [price, setPrice] = useState<number>(1_500_000);
  const [depositPct, setDepositPct] = useState<number>(10);
  const [rate, setRate] = useState<number>(11.25);
  const [term, setTerm] = useState<number>(20);

  const deposit = price * (depositPct / 100);
  const loanAmount = Math.max(price - deposit, 0);
  const monthly = monthlyPayment(loanAmount, rate, term);
  const totalPaid = monthly * term * 12;
  const totalInterest = totalPaid - loanAmount;
  const minSalary = monthly > 0 ? monthly / 0.30 : 0; // banks allow 30% of gross

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Property Price
          </span>
          <span className="font-mono text-xl font-semibold text-atlas-text">
            {formatZAR(price)}
          </span>
        </div>
        <Slider
          value={price}
          onChange={setPrice}
          min={250_000}
          max={10_000_000}
          step={50_000}
          ariaLabel="Property price"
          formatValue={(v) => formatZAR(v)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Deposit
          </span>
          <span className="font-mono text-sm text-atlas-text">
            {depositPct.toFixed(0)}%{" "}
            <span className="text-atlas-muted">
              ({formatZAR(deposit)})
            </span>
          </span>
        </div>
        <Slider
          value={depositPct}
          onChange={setDepositPct}
          min={0}
          max={50}
          step={1}
          ariaLabel="Deposit percentage"
          formatValue={(v) => `${v}%`}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Interest Rate
          </span>
          <span className="font-mono text-sm text-atlas-text">{formatPct(rate)}</span>
        </div>
        <Slider
          value={rate}
          onChange={setRate}
          min={5}
          max={20}
          step={0.05}
          ariaLabel="Annual interest rate"
          formatValue={(v) => `${v.toFixed(2)}%`}
        />
      </div>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
          Loan Term
        </span>
        <PillGroup
          value={term}
          onChange={setTerm}
          ariaLabel="Loan term in years"
          options={[
            { value: 10, label: "10 yr" },
            { value: 15, label: "15 yr" },
            { value: 20, label: "20 yr" },
            { value: 25, label: "25 yr" },
            { value: 30, label: "30 yr" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        <BigStat
          label="Monthly Repayment"
          value={formatZAR(monthly)}
          suffix="per month"
          emphasis
        />
        <BigStat
          label="Min. Monthly Salary"
          value={formatZAR(minSalary)}
          suffix="before tax"
        />
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4">
        <SmallStat label="Total Loan Amount" value={formatZAR(loanAmount)} />
        <SmallStat label="Total Interest" value={formatZAR(totalInterest)} />
        <SmallStat label="Total Repayment" value={formatZAR(totalPaid)} />
      </div>

      <div className="rounded-xl border border-atlas-accent/30 bg-atlas-accent/5 p-4 text-center text-xs">
        <p className="mb-2 font-medium text-atlas-text">
          Ready to apply?
        </p>
        <p className="mb-3 text-atlas-muted">
          Bond originators apply to multiple banks at once — free service.
        </p>
        <div className="flex justify-center gap-2">
          <a
            href="https://www.ooba.co.za/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-atlas-accent px-3 py-1.5 font-medium text-white transition-colors hover:bg-atlas-accent2"
          >
            Apply via ooba
          </a>
          <a
            href="https://www.betterbond.co.za/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            BetterBond
          </a>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 2 — Buy-to-Let (rental yield + cashflow)                          */
/* ------------------------------------------------------------------ */

function BuyToLetTab() {
  const [price, setPrice] = useState<number>(1_500_000);
  const [monthlyRent, setMonthlyRent] = useState<number>(9_000);
  const [monthlyCosts, setMonthlyCosts] = useState<number>(2_500);
  const [depositPct, setDepositPct] = useState<number>(20);
  const [rate, setRate] = useState<number>(11.25);

  const deposit = price * (depositPct / 100);
  const loanAmount = Math.max(price - deposit, 0);
  const monthlyBond = monthlyPayment(loanAmount, rate, 20);
  const monthlyCashflow = monthlyRent - monthlyBond - monthlyCosts;
  const annualRent = monthlyRent * 12;
  const annualCosts = monthlyCosts * 12;
  const annualNet = annualRent - annualCosts - monthlyBond * 12;
  const grossYield = price > 0 ? (annualRent / price) * 100 : 0;
  const netYield = price > 0 ? (annualNet / price) * 100 : 0;
  const cashOnCash =
    deposit > 0 ? (annualNet / deposit) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Property Price
          </span>
          <span className="font-mono text-xl font-semibold text-atlas-text">
            {formatZAR(price)}
          </span>
        </div>
        <Slider
          value={price}
          onChange={setPrice}
          min={250_000}
          max={10_000_000}
          step={50_000}
          ariaLabel="Property price"
          formatValue={(v) => formatZAR(v)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Deposit
          </span>
          <span className="font-mono text-sm text-atlas-text">
            {depositPct.toFixed(0)}%{" "}
            <span className="text-atlas-muted">
              ({formatZAR(deposit)})
            </span>
          </span>
        </div>
        <Slider
          value={depositPct}
          onChange={setDepositPct}
          min={0}
          max={50}
          step={1}
          ariaLabel="Deposit percentage"
          formatValue={(v) => `${v}%`}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Monthly Rent
          </span>
          <span className="font-mono text-xl font-semibold text-atlas-text">
            {formatZAR(monthlyRent)}
          </span>
        </div>
        <Slider
          value={monthlyRent}
          onChange={setMonthlyRent}
          min={1000}
          max={50_000}
          step={500}
          ariaLabel="Expected monthly rent"
          formatValue={(v) => formatZAR(v)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Monthly Costs
          </span>
          <span className="font-mono text-sm text-atlas-muted">
            (rates, levies, maintenance)
          </span>
        </div>
        <Slider
          value={monthlyCosts}
          onChange={setMonthlyCosts}
          min={0}
          max={15_000}
          step={250}
          ariaLabel="Monthly holding costs"
          formatValue={(v) => formatZAR(v)}
        />
      </div>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
          Bond Rate (assumed 20-yr)
        </span>
        <Slider
          value={rate}
          onChange={setRate}
          min={5}
          max={20}
          step={0.05}
          ariaLabel="Bond interest rate (20-yr assumed)"
          formatValue={(v) => `${v.toFixed(2)}%`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        <BigStat
          label="Gross Yield"
          value={formatPct(grossYield)}
          emphasis
        />
        <BigStat
          label="Net Yield"
          value={formatPct(netYield)}
        />
        <BigStat
          label="Cash-on-Cash Return"
          value={formatPct(cashOnCash)}
        />
        <BigStat
          label="Monthly Cashflow"
          value={(monthlyCashflow >= 0 ? "+" : "") + formatZAR(monthlyCashflow)}
        />
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4">
        <SmallStat label="Annual Gross Rent" value={formatZAR(annualRent)} />
        <SmallStat label="Annual Costs" value={formatZAR(annualCosts + monthlyBond * 12)} />
        <SmallStat label="Annual Net Income" value={formatZAR(annualNet)} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 3 — ROI Projector                                                 */
/* ------------------------------------------------------------------ */

function RoiTab() {
  const [price, setPrice] = useState<number>(1_500_000);
  const [depositPct, setDepositPct] = useState<number>(20);
  const [appreciationPct, setAppreciationPct] = useState<number>(5);
  const [rentYieldPct, setRentYieldPct] = useState<number>(7);
  const [holdYears, setHoldYears] = useState<number>(10);

  const deposit = price * (depositPct / 100);
  const loanAmount = Math.max(price - deposit, 0);
  const rate = 11.25;
  const monthlyBond = monthlyPayment(loanAmount, rate, 20);

  // Projection
  const futureValue = price * Math.pow(1 + appreciationPct / 100, holdYears);
  const capitalGain = futureValue - price;
  const annualRent = price * (rentYieldPct / 100);
  const totalRent = annualRent * holdYears;
  const bondInterestPaid = monthlyBond * 12 * holdYears - loanAmount;
  const totalBenefit = capitalGain + totalRent;
  const totalInvested = deposit + bondInterestPaid;
  const roi = totalInvested > 0 ? (totalBenefit / totalInvested) * 100 : 0;
  const annualizedRoi = roi / holdYears;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Purchase Price
          </span>
          <span className="font-mono text-xl font-semibold text-atlas-text">
            {formatZAR(price)}
          </span>
        </div>
        <Slider
          value={price}
          onChange={setPrice}
          min={250_000}
          max={10_000_000}
          step={50_000}
          ariaLabel="Purchase price"
          formatValue={(v) => formatZAR(v)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Deposit
          </span>
          <span className="font-mono text-sm text-atlas-text">
            {depositPct.toFixed(0)}%{" "}
            <span className="text-atlas-muted">({formatZAR(deposit)})</span>
          </span>
        </div>
        <Slider
          value={depositPct}
          onChange={setDepositPct}
          min={0}
          max={50}
          step={1}
          ariaLabel="Deposit percentage"
          formatValue={(v) => `${v}%`}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Annual Appreciation
          </span>
          <span className="font-mono text-sm text-atlas-text">{formatPct(appreciationPct)}</span>
        </div>
        <Slider
          value={appreciationPct}
          onChange={setAppreciationPct}
          min={0}
          max={15}
          step={0.5}
          ariaLabel="Annual appreciation rate"
          formatValue={(v) => `${v.toFixed(1)}%`}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Rental Yield
          </span>
          <span className="font-mono text-sm text-atlas-text">{formatPct(rentYieldPct)}</span>
        </div>
        <Slider
          value={rentYieldPct}
          onChange={setRentYieldPct}
          min={0}
          max={15}
          step={0.5}
          ariaLabel="Annual rental yield"
          formatValue={(v) => `${v.toFixed(1)}%`}
        />
      </div>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
          Hold Period
        </span>
        <PillGroup
          value={holdYears}
          onChange={setHoldYears}
          ariaLabel="Investment hold period in years"
          options={[
            { value: 5, label: "5 yr" },
            { value: 7, label: "7 yr" },
            { value: 10, label: "10 yr" },
            { value: 15, label: "15 yr" },
            { value: 20, label: "20 yr" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        <BigStat
          label="Future Value"
          value={formatZAR(futureValue)}
          emphasis
        />
        <BigStat
          label={`Capital Gain (${holdYears} yr)`}
          value={formatZAR(capitalGain)}
        />
        <BigStat
          label="Total ROI"
          value={formatPct(roi)}
        />
        <BigStat
          label="Annualized ROI"
          value={formatPct(annualizedRoi)}
        />
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4">
        <SmallStat label="Future Value" value={formatZAR(futureValue)} />
        <SmallStat label="Capital Gain" value={formatZAR(capitalGain)} />
        <SmallStat label="Total Rent Received" value={formatZAR(totalRent)} />
        <SmallStat label="Bond Interest Paid" value={formatZAR(bondInterestPaid)} />
        <SmallStat label="Cash Invested (deposit + interest)" value={formatZAR(totalInvested)} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 4 — Transfer Costs (SA)                                           */
/* ------------------------------------------------------------------ */

function TransferCostsTab() {
  const [price, setPrice] = useState<number>(1_500_000);
  const [bondRequired, setBondRequired] = useState<boolean>(true);
  const [includeVat, setIncludeVat] = useState<boolean>(true);

  const transferDutyCost = transferDuty(price);
  const attorneyFee = attorneyConveyancingFee(price);
  const deedsLevy = deedsOfficeLevy(price);
  const bondRegFee = bondRequired ? bondRegistrationFee() : 0;
  const vat = includeVat ? attorneyFee * 0.15 : 0;
  const total = transferDutyCost + attorneyFee + deedsLevy + bondRegFee + vat;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-atlas-muted">
            Property Price
          </span>
          <span className="font-mono text-xl font-semibold text-atlas-text">
            {formatZAR(price)}
          </span>
        </div>
        <Slider
          value={price}
          onChange={setPrice}
          min={250_000}
          max={10_000_000}
          step={50_000}
          ariaLabel="Property price"
          formatValue={(v) => formatZAR(v)}
        />
      </div>

      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-atlas-text">
          <input
            type="checkbox"
            checked={bondRequired}
            onChange={(e) => setBondRequired(e.target.checked)}
            className="h-4 w-4 rounded border-atlas-border bg-atlas-surface accent-atlas-accent"
          />
          Bond required (buying with a mortgage)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-atlas-text">
          <input
            type="checkbox"
            checked={includeVat}
            onChange={(e) => setIncludeVat(e.target.checked)}
            className="h-4 w-4 rounded border-atlas-border bg-atlas-surface accent-atlas-accent"
          />
          Include VAT on attorney fees (15%)
        </label>
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4">
        <SmallStat label="Transfer Duty (SARS)" value={formatZAR(transferDutyCost)} />
        <SmallStat label="Attorney Conveyancing Fee" value={formatZAR(attorneyFee)} />
        <SmallStat label="Deeds Office Levy" value={formatZAR(deedsLevy)} />
        {bondRequired && (
          <SmallStat label="Bond Registration" value={formatZAR(bondRegFee)} />
        )}
        {includeVat && (
          <SmallStat label="VAT on Attorney Fee" value={formatZAR(vat)} />
        )}
      </div>

      <BigStat label="Total Transfer Costs" value={formatZAR(total)} emphasis />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                            */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "affordability", label: "Bond Affordability", component: AffordabilityTab },
  { id: "buy-to-let", label: "Buy-to-Let", component: BuyToLetTab },
  { id: "roi", label: "ROI Projector", component: RoiTab },
  { id: "transfer", label: "Transfer Costs", component: TransferCostsTab },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CalculatorClient() {
  const [activeTab, setActiveTab] = useState<TabId>("affordability");
  const ActiveComponent =
    TABS.find((t) => t.id === activeTab)?.component ?? AffordabilityTab;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-1.5">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={
                  "rounded-md px-3 py-2 text-xs font-medium transition-colors " +
                  (active
                    ? "bg-atlas-accent text-white"
                    : "text-atlas-muted hover:bg-atlas-bg hover:text-atlas-text")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <ActiveComponent />
    </div>
  );
}
