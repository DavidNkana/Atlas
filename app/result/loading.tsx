import { AppShell } from "@/components/AppShell";

export default function ResultLoading() {
  return (
    <AppShell>
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
          <p className="text-sm text-atlas-muted">Loading result…</p>
        </div>
      </div>
    </AppShell>
  );
}
