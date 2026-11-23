"use client";

import { useState } from "react";

export default function ShareProfileLink({ handle }: { handle: string }) {
  const [label, setLabel] = useState("Share profile");

  async function copy() {
    const url = `${window.location.origin}/player/${handle}`;
    try {
      await navigator.clipboard.writeText(url);
      setLabel("Link copied");
    } catch {
      setLabel("Copy failed");
    }
    window.setTimeout(() => setLabel("Share profile"), 2200);
  }

  return (
    <button
      onClick={copy}
      className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
    >
      {label}
    </button>
  );
}
