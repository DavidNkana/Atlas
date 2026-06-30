"use client";

import { useState } from "react";

export function ShareButton({
  resultId,
  title,
  text,
}: {
  resultId: string;
  title: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/result/${resultId}`
    : `/result/${resultId}`;

  async function handleShare() {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title,
          text: text ?? title,
          url,
        });
        return;
      } catch {
        // user cancelled or not supported
      }
    }
    setOpen(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const networks = [
    { k: "twitter", l: "X / Twitter", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text ?? title)}&url=${encodeURIComponent(url)}` },
    { k: "linkedin", l: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { k: "facebook", l: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { k: "whatsapp", l: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent((text ?? title) + " " + url)}` },
    { k: "telegram", l: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text ?? title)}` },
    { k: "email", l: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent((text ?? title) + "\n\n" + url)}` },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleShare}
        aria-label="Share result"
        className="inline-flex items-center gap-1.5 rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs text-atlas-text transition-colors hover:border-atlas-accent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-52 rounded-md border border-atlas-border bg-atlas-surface p-1 shadow-lg shadow-black/30 z-50">
          <button
            type="button"
            onClick={copyLink}
            className="block w-full rounded px-3 py-1.5 text-left text-xs text-atlas-text hover:bg-atlas-surface2"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <div className="my-1 h-px bg-atlas-border" />
          {networks.map((n) => (
            <a
              key={n.k}
              href={n.href}
              target="_blank"
              rel="noreferrer noopener"
              className="block rounded px-3 py-1.5 text-xs text-atlas-text hover:bg-atlas-surface2"
            >
              {n.l}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
