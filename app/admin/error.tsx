"use client";

// Error boundary for the /admin route segment. Without this, an exception
// thrown during render of any /admin page sends Next.js into the
// "missing required error components, refreshing..." loop in dev mode
// and crashes the route in prod.

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] render error:", error);
  }, [error]);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-4">
      <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--magenta)]">
        ▣ ADMIN PAGE ERROR
      </div>
      <h1 className="font-mono text-2xl glitch text-[var(--magenta)]" data-text="// FAULT">
        // FAULT
      </h1>
      <div className="border border-[var(--magenta)] bg-[var(--magenta)]/5 px-4 py-3 font-mono text-xs tracking-widest text-[var(--magenta)] break-words space-y-2">
        <div>{error.message}</div>
        {error.digest && (
          <div className="text-[10px] text-[var(--fg-dim)]">digest: {error.digest}</div>
        )}
      </div>
      <button onClick={reset} className="btn-neon">
        ▲ Retry
      </button>
    </div>
  );
}
