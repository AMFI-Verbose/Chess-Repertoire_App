"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useRouter } from "next/navigation";

import {
  addComment,
  addStudyToRepertoire,
  deleteStudy,
  type StudyDetail,
} from "@/app/actions";
import { DARK_SQUARE, LIGHT_SQUARE, squaresOf, tint } from "@/lib/boardTheme";
import { START_FEN } from "@/lib/chess";
import { play } from "@/lib/sound";

type Move = { san: string; uci: string; after: string };

export default function StudyViewer({ study }: { study: StudyDetail }) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [anchor, setAnchor] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { moves, positions } = useMemo(() => {
    const game = new Chess();
    try {
      game.loadPgn(study.pgn);
    } catch {
      // A malformed PGN should not take the page down.
    }
    const parsed = game.history({ verbose: true }).map((move) => ({
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      after: move.after,
    }));
    return {
      moves: parsed as Move[],
      positions: [START_FEN, ...parsed.map((move) => move.after)],
    };
  }, [study.pgn]);

  function goTo(index: number) {
    const next = Math.max(0, Math.min(moves.length, index));
    if (next === at) return;
    setAt(next);
    play("navigate");
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(at + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(at - 1);
      } else if (event.key === "Home") {
        goTo(0);
      } else if (event.key === "End") {
        goTo(moves.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const squareStyles = useMemo(() => {
    const styles: Record<string, { backgroundImage?: string }> = {};
    if (at > 0 && moves[at - 1]) {
      for (const square of squaresOf(moves[at - 1].uci)) {
        styles[square] = { backgroundImage: tint("rgba(155, 199, 0, 0.41)") };
      }
    }
    return styles;
  }, [at, moves]);

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (body.trim().length === 0 || posting) return;
    setPosting(true);
    try {
      await addComment({
        studyId: study.id,
        author,
        body,
        // Anchor the note to the position on screen, so the thread reads as
        // annotations rather than floating opinions.
        ply: anchor ? at : 0,
      });
      setBody("");
      router.refresh();
    } finally {
      setPosting(false);
    }
  }

  async function unpublish() {
    if (deleting) return;
    setDeleting(true);
    try {
      const gone = await deleteStudy({ studyId: study.id });
      if (gone) router.push("/community");
      else setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function practise() {
    if (importing) return;
    setImporting(true);
    try {
      const created = await addStudyToRepertoire({ studyId: study.id });
      if (created) router.push(`/r/${created.repertoireId}`);
    } finally {
      setImporting(false);
    }
  }

  /** Which moves carry notes, so the scoresheet can show a dot on them. */
  const notesByPly = useMemo(() => {
    const counts = new Map<number, number>();
    for (const comment of study.comments) {
      if (comment.ply > 0) counts.set(comment.ply, (counts.get(comment.ply) ?? 0) + 1);
    }
    return counts;
  }, [study.comments]);

  /** "12. Nf3" for a half-move index, or null for the start position. */
  function labelForPly(ply: number) {
    if (ply <= 0) return null;
    const move = moves[ply - 1];
    const number = Math.floor((ply - 1) / 2) + 1;
    const dots = ply % 2 === 1 ? "." : "…";
    return `${number}${dots} ${move ? move.san : "?"}`;
  }

  const rows = useMemo(() => {
    const pairs: { number: number; white?: Move; black?: Move; whitePly: number; blackPly: number }[] = [];
    moves.forEach((move, index) => {
      const number = Math.floor(index / 2) + 1;
      if (index % 2 === 0) {
        pairs.push({ number, white: move, whitePly: index + 1, blackPly: index + 2 });
      } else {
        pairs[pairs.length - 1].black = move;
      }
    });
    return pairs;
  }, [moves]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex flex-col items-center gap-3">
        <div className="w-full max-w-[600px] overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
          <Chessboard
            options={{
              id: "study-board",
              position: positions[at] || START_FEN,
              squareStyles,
              animationDurationInMs: 180,
              lightSquareStyle: LIGHT_SQUARE,
              darkSquareStyle: DARK_SQUARE,
            }}
          />
        </div>

        <div className="flex w-full max-w-[600px] items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => goTo(0)}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              ⏮
            </button>
            <button
              onClick={() => goTo(at - 1)}
              disabled={at === 0}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
            >
              ◀
            </button>
            <button
              onClick={() => goTo(at + 1)}
              disabled={at === moves.length}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
            >
              ▶
            </button>
            <button
              onClick={() => goTo(moves.length)}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              ⏭
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            ply {at} / {moves.length} · ← → to step
          </p>
        </div>

        <div className="w-full max-w-[600px] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="max-h-40 overflow-y-auto font-mono text-xs">
            <div className="flex flex-wrap gap-x-1 gap-y-1">
              {rows.map((row) => (
                <span key={row.number} className="flex items-center gap-1">
                  <span className="text-[var(--muted)]">{row.number}.</span>
                  <button
                    onClick={() => goTo(row.whitePly)}
                    className={`rounded px-1.5 py-0.5 transition ${
                      at === row.whitePly
                        ? "bg-[var(--accent)] text-[#04231d]"
                        : "hover:bg-[var(--panel-2)]"
                    }`}
                  >
                    {row.white?.san}
                    {row.white && notesByPly.has(row.whitePly) && (
                      <span className="ml-0.5 text-[var(--accent)]">•</span>
                    )}
                  </button>
                  {row.black && (
                    <button
                      onClick={() => goTo(row.blackPly)}
                      className={`rounded px-1.5 py-0.5 transition ${
                        at === row.blackPly
                          ? "bg-[var(--accent)] text-[#04231d]"
                          : "hover:bg-[var(--panel-2)]"
                      }`}
                    >
                      {row.black.san}
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          {study.eco && (
            <span className="mb-2 inline-block rounded-md border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
              {study.eco}
            </span>
          )}
          <h2 className="text-lg font-semibold leading-tight">{study.title}</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
            {study.subtitle}
          </p>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Published by <span className="text-[var(--text)]">{study.author || "Community"}</span>
          </p>
          <button
            onClick={practise}
            disabled={importing}
            className="mt-4 w-full rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[#04231d] disabled:opacity-60"
          >
            {importing ? "Importing…" : "Practise this game →"}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            Copies the full game into a new repertoire you can branch and drill.
          </p>
          {study.author !== "Community" &&
            (confirmDelete ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--line)] p-2">
                <span className="flex-1 text-[11px] text-[var(--muted)]">
                  Remove from the community?
                </span>
                <button
                  onClick={unpublish}
                  disabled={deleting}
                  className="rounded-md bg-red-500/90 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
                >
                  {deleting ? "…" : "Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--muted)]"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="mt-3 text-[11px] text-[var(--muted)] underline decoration-dotted transition hover:text-[var(--text)]"
              >
                Unpublish this study
              </button>
            ))}
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Discussion</h3>
            <span className="text-[11px] text-[var(--muted)]">
              {study.comments.length} comment{study.comments.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {study.comments.length === 0 && (
              <p className="text-xs text-[var(--muted)]">
                No comments yet — start the thread.
              </p>
            )}
            {study.comments.map((comment) => (
              <article
                key={comment.id}
                className={`flex gap-3 ${
                  comment.ply === at && at > 0 ? "rounded-lg bg-[var(--panel-2)] p-2" : ""
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[#f0d9b5] text-xs font-semibold text-[#b58863]">
                  {comment.author.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs font-medium">{comment.author}</span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {new Date(comment.createdAt).toISOString().slice(0, 10)}
                    </span>
                    {comment.ply > 0 && (
                      <button
                        onClick={() => goTo(comment.ply)}
                        title="Jump to this position"
                        className="rounded border border-[var(--line)] bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)] transition hover:border-[var(--accent)]"
                      >
                        {labelForPly(comment.ply)}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    {comment.body}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <form onSubmit={submitComment} className="mt-5 border-t border-[var(--line)] pt-4">
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Your name (optional)"
              className="mb-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
            />
            {at > 0 && (
              <label className="mb-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={anchor}
                  onChange={(event) => setAnchor(event.target.checked)}
                  className="h-3 w-3 accent-[var(--accent)]"
                />
                Attach to <span className="font-mono text-[var(--accent)]">{labelForPly(at)}</span>
              </label>
            )}
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What did you see in this game?"
              rows={3}
              className="w-full resize-none rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-xs leading-relaxed outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={posting || body.trim().length === 0}
              className="mt-2 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[#04231d] transition hover:brightness-110 disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post comment"}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
