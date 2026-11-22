"use client";

import { useState } from "react";

import { resendVerification } from "@/app/auth/actions";

/**
 * Shown wherever an unconfirmed account would otherwise hit a dead end:
 * the community page, the comment box, and the publish panel.
 */
export default function VerifyNotice({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await resendVerification();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(result.message ?? "Confirmation link created.");
      setDevLink(result.devLink ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-lg border border-amber-500/40 bg-amber-500/10 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <p className="text-xs leading-relaxed text-amber-200">
        Confirm your email to publish games and write notes. Reading is always open.
      </p>
      <button
        onClick={resend}
        disabled={busy}
        className="mt-2 rounded-md border border-amber-500/50 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/15 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Resend confirmation link"}
      </button>

      {message && <p className="mt-2 text-[11px] text-amber-200/90">{message}</p>}
      {devLink && (
        <a
          href={devLink}
          className="mt-2 block break-all text-[11px] text-[var(--accent)] underline"
        >
          No mail server configured — open this confirmation link (local mode)
        </a>
      )}
    </div>
  );
}
