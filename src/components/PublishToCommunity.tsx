"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { publishGameAsStudy } from "@/app/actions";

/**
 * Put a finished game on the community shelf. The PGN is copied, so editing
 * this game later never rewrites what readers already saw.
 */
export default function PublishToCommunity({
  gameId,
  defaultTitle,
  defaultSubtitle,
  handle,
}: {
  gameId: string;
  defaultTitle: string;
  defaultSubtitle: string;
  handle: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await publishGameAsStudy({ gameId, title, subtitle });
      if (!created) {
        setError("This game has no moves to publish.");
        return;
      }
      router.push(`/community/${created.studyId}`);
    } catch {
      setError("Could not publish this game.");
    } finally {
      setBusy(false);
    }
  }

  if (!handle) {
    return (
      <a
        href="/login"
        className="block rounded-lg border border-[var(--line)] px-3 py-2 text-center text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        Sign in to publish to Community
      </a>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--accent)] px-3 py-2 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[#04231d]"
      >
        Publish to Community
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--accent)]/60 bg-[var(--panel-2)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium">Publish to Community</p>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Close
        </button>
      </div>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={defaultTitle}
        className="mb-2 w-full rounded-md border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
      />
      <input
        value={subtitle}
        onChange={(event) => setSubtitle(event.target.value)}
        placeholder={defaultSubtitle}
        className="mb-2 w-full rounded-md border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
      />
      <p className="mb-2 text-[10px] text-[var(--muted)]">
        Published as <span className="text-[var(--accent)]">@{handle}</span>
      </p>
      {error && <p className="mb-2 text-[11px] text-red-400">{error}</p>}
      <button
        onClick={publish}
        disabled={busy}
        className="w-full rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-[#04231d] transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Publishing…" : "Publish and open"}
      </button>
    </div>
  );
}
