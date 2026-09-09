"use client";

import { useEffect, useRef, useState } from "react";

export type AdminUser = {
  userId: string;
  primaryEmail: string;
  availableEmails: string[];
  firstName: string | null;
  lastName: string | null;
  plan: string;
  questionCount: number;
  plotCount: number;
  hasBillingLink: boolean;
  onboardingComplete?: boolean;
  createdAt?: string;
};

export function UserManagement({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [typedEmail, setTypedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog(user: AdminUser) {
    setSelected(user);
    setTypedEmail("");
    setError(null);
  }

  function closeDialog() {
    if (!loading) setSelected(null);
  }

  async function deleteUser() {
    if (!selected || typedEmail.trim().toLowerCase() !== selected.primaryEmail.toLowerCase()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selected.userId)}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.details || body.error || "Deletion failed");
      setUsers((current) => current.filter((user) => user.userId !== selected.userId));
      setSelected(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Deletion failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
        User accounts
      </h2>
      <div className="overflow-x-auto rounded-xl border border-atlas-border bg-atlas-surface">
        {users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-atlas-muted">No Clerk users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-atlas-border text-[10px] uppercase tracking-wider text-atlas-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">Questions</th>
                <th className="px-3 py-2 text-left font-medium">Plots</th>
                <th className="px-3 py-2 text-left font-medium">Onboarding</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
                <th className="px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId} className="border-b border-atlas-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="text-xs text-atlas-text">
                      {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user"}
                    </div>
                    <div className="font-mono text-xs text-atlas-text">{user.primaryEmail || "No email address"}</div>
                    {user.availableEmails.length > 1 && (
                      <div className="text-[10px] text-atlas-muted" title={user.availableEmails.join(", ")}>
                        +{user.availableEmails.length - 1} other email{user.availableEmails.length === 2 ? "" : "s"}
                      </div>
                    )}
                    <div className="font-mono text-[10px] text-atlas-muted">{user.userId}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className={user.hasBillingLink ? "text-amber-300" : "text-atlas-muted"}>
                      {user.plan}{user.hasBillingLink ? " · billing attached" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-atlas-muted">{user.questionCount}</td>
                  <td className="px-3 py-2 font-mono text-xs text-atlas-muted">{user.plotCount}</td>
                  <td className="px-3 py-2 text-xs text-atlas-muted">
                    {user.onboardingComplete === undefined ? "—" : user.onboardingComplete ? "Complete" : "Incomplete"}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-atlas-muted">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openDialog(user)}
                      className="rounded border border-rose-400/50 px-2 py-1 text-[10px] font-medium text-rose-300 transition hover:bg-rose-400/10 focus:outline-none focus:ring-2 focus:ring-rose-300"
                    >
                      Delete user
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && (
        <DeleteDialog
          user={selected}
          typedEmail={typedEmail}
          setTypedEmail={setTypedEmail}
          loading={loading}
          error={error}
          onClose={closeDialog}
          onDelete={deleteUser}
        />
      )}
    </section>
  );
}

function DeleteDialog({
  user,
  typedEmail,
  setTypedEmail,
  loading,
  error,
  onClose,
  onDelete,
}: {
  user: AdminUser;
  typedEmail: string;
  setTypedEmail: (value: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const confirmed = Boolean(user.primaryEmail) && !user.hasBillingLink && typedEmail.trim().toLowerCase() === user.primaryEmail.toLowerCase();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        className="w-full max-w-lg rounded-xl border border-rose-400/40 bg-atlas-surface p-6 shadow-2xl"
      >
        <h3 id="delete-user-title" className="text-base font-semibold text-atlas-text">Delete user permanently?</h3>
        <div className="mt-3 space-y-1 text-xs text-atlas-muted">
          <p>Email: <strong className="text-atlas-text">{user.primaryEmail || "No email address"}</strong></p>
          <p>User ID: <code className="text-atlas-text">{user.userId}</code></p>
          <p>Will delete {user.questionCount} question{user.questionCount === 1 ? "" : "s"} and {user.plotCount} plot{user.plotCount === 1 ? "" : "s"}.</p>
          <p>Billing status: <strong className={user.hasBillingLink ? "text-amber-300" : "text-emerald-300"}>
            {user.hasBillingLink ? `${user.plan}; billing attached` : "free; no billing attached"}
          </strong></p>
        </div>
        <p className="mt-4 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
          {user.hasBillingLink
            ? "Deletion is blocked while billing is attached. Cancel and verify the subscription first."
            : "This permanently deletes the local account data and Clerk account. This cannot be undone."}
        </p>
        <label className="mt-4 block text-xs text-atlas-muted" htmlFor="delete-confirm-email">
          Type the user&apos;s email to confirm
        </label>
        <input
          ref={inputRef}
          id="delete-confirm-email"
          value={typedEmail}
          onChange={(event) => setTypedEmail(event.target.value)}
          disabled={loading}
          className="mt-1 w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-300/30"
          autoComplete="off"
        />
        {error && <p className="mt-2 text-xs text-rose-300" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="rounded px-3 py-2 text-xs text-atlas-muted hover:text-atlas-text">
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!confirmed || loading}
            className="rounded bg-rose-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Deleting…" : "Permanently delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
