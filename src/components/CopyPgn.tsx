"use client";

import { useState } from "react";

export default function CopyPgn({ pgn }: { pgn: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(pgn);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard permission denied — the PGN is still visible below.
        }
      }}
      className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-xs transition hover:border-[var(--accent)]"
    >
      {copied ? "Copied ✓" : "Copy PGN"}
    </button>
  );
}
