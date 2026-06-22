"use client";

/**
 * Day 30 — Result page Chat button.
 *
 * Server components can't carry onClick handlers or window
 * references, so the Chat button lives in this tiny client
 * component. It dispatches the same 'atlas:openChat'
 * CustomEvent that the Sidebar's "Chat" button uses, and
 * AppShell's singleton FullScreenChat picks it up.
 *
 * Pre-fills the chat with the current question context so
 * the user can immediately ask follow-ups without re-typing.
 */

interface ResultChatButtonProps {
  question: string;
  vertical?: string | null;
  rankedSites: Array<{ name: string; suburb?: string }>;
}

export function ResultChatButton({
  question,
  vertical,
  rankedSites,
}: ResultChatButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          // LCP-35 — no initialQuestion. The chat opens empty
          // with example prompts visible. The questionContext
          // and rankedSites are still passed so the LLM has
          // the city / vertical signal for any follow-up the
          // user types.
          window.dispatchEvent(
            new CustomEvent("atlas:openChat", {
              detail: {
                questionContext: question,
                vertical: vertical ?? undefined,
                rankedSites,
              },
            }),
          );
        }
      }}
      className="flex items-center gap-1.5 rounded-md border border-atlas-accent/60 bg-atlas-accent/10 px-3 py-1.5 text-xs font-medium text-atlas-accent transition-colors hover:bg-atlas-accent/20"
      title="Research with Atlas"
      data-testid="atlas-open-full-chat-result"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span>Research</span>
    </button>
  );
}
