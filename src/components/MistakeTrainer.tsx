"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

import {
  loadMistakeCard,
  recordMistakeAttempt,
} from "@/app/train/mistakes/actions";
import type { MistakeCard, MistakeStats } from "@/lib/mistakes";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";
import { hintStyles } from "@/lib/boardHints";
import { isPromotion } from "@/lib/chess";
import { play } from "@/lib/sound";
import PromotionPicker, { type PromotionPiece } from "@/components/PromotionPicker";

type Status = "solving" | "solved" | "failed" | "revealed";

function normalized(uci: string) {
  return `${uci.slice(0, 4)}${uci.length > 4 ? uci[4] : "q"}`;
}

function dueLabel(iso: string | null, due: number) {
  if (due > 0) return `${due} waiting now`;
  if (!iso) return "No cards yet";
  return `Next card ${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))}`;
}

export default function MistakeTrainer({
  initial,
  initialStats,
  gameId,
  ignoreDue = false,
}: {
  initial: MistakeCard;
  initialStats: MistakeStats;
  gameId?: string;
  ignoreDue?: boolean;
}) {
  const [card, setCard] = useState(initial);
  const [stats, setStats] = useState(initialStats);
  const [position, setPosition] = useState(initial.fen);
  const [status, setStatus] = useState<Status>("solving");
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [queuedNext, setQueuedNext] = useState<MistakeCard | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [reviewDays, setReviewDays] = useState<number | null>(null);

  const board = useRef(new Chess(initial.fen));
  const reported = useRef(false);

  const turn = board.current.turn();
  // The board must not flip when the answer is played: orientation belongs to
  // the position being asked, not to whoever is on move afterwards.
  const orientation = useMemo(
    () => (new Chess(card.fen).turn() === "w" ? "white" : "black"),
    [card.fen],
  );

  const squareStyles = useMemo(
    () => hintStyles(position, { selected, lastMove, legalMovesFor: selected }),
    [position, selected, lastMove],
  );

  async function record(solved: boolean) {
    if (reported.current) return;
    reported.current = true;
    try {
      const result = await recordMistakeAttempt({
        id: card.id,
        solved,
        gameId,
        ignoreDue,
      });
      setStats(result.stats);
      setQueuedNext(result.next);
      setDueAt(result.dueAt);
      setReviewDays(
        Math.max(1, Math.round((new Date(result.dueAt).getTime() - Date.now()) / 86_400_000)),
      );
    } catch {
      reported.current = false;
    }
  }

  function settlePlayed(uci: string) {
    if (normalized(uci) === normalized(card.solution)) {
      setStatus("solved");
      play("success");
      void record(true);
    } else {
      setStatus("failed");
      play("error");
      void record(false);
    }
  }

  function attempt(sourceSquare: string, targetSquare: string, promotion?: PromotionPiece): boolean {
    if (status !== "solving" || loading) return false;

    let legal = false;
    try {
      const probe = new Chess(board.current.fen());
      legal = Boolean(
        probe.move({ from: sourceSquare, to: targetSquare, promotion: promotion ?? "q" }),
      );
    } catch {
      legal = false;
    }
    if (!legal) return false;

    if (!promotion && isPromotion(board.current.fen(), sourceSquare, targetSquare)) {
      setPromo({ from: sourceSquare, to: targetSquare });
      return false;
    }

    const move = board.current.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: promotion ?? "q",
    });
    if (!move) return false;
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    setPosition(board.current.fen());
    setLastMove(uci);
    setSelected(null);
    settlePlayed(uci);
    return true;
  }

  function onDrop({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    setSelected(null);
    if (!targetSquare) return false;
    return attempt(sourceSquare, targetSquare);
  }

  function onSquareClick({ square }: { square: string }) {
    if (status !== "solving") return;
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (selected) {
      const moved = attempt(selected, square);
      if (moved) return;
    }
    const piece = board.current.get(square as never);
    if (piece && piece.color === board.current.turn()) {
      setSelected(square);
      play("navigate");
    } else {
      setSelected(null);
    }
  }

  function showBest() {
    if (status === "solved") return;
    board.current = new Chess(card.fen);
    const best = card.solution;
    const move = board.current.move({
      from: best.slice(0, 2),
      to: best.slice(2, 4),
      promotion: best.length > 4 ? best[4] : "q",
    });
    if (move) {
      setPosition(board.current.fen());
      setLastMove(`${move.from}${move.to}${move.promotion ?? ""}`);
    }
    setStatus("revealed");
    setSelected(null);
    if (!reported.current) void record(false);
  }

  function reset() {
    board.current = new Chess(card.fen);
    setPosition(card.fen);
    setLastMove(null);
    setSelected(null);
    setPromo(null);
    setStatus("solving");
    // The schedule was already updated by the first attempt; retrying is
    // practice and must not count as a second result.
  }

  async function nextCard() {
    setLoading(true);
    try {
      if (queuedNext) {
        setCard(queuedNext);
        board.current = new Chess(queuedNext.fen);
        setPosition(queuedNext.fen);
        setLastMove(null);
        setSelected(null);
        setStatus("solving");
        setQueuedNext(null);
        setDueAt(null);
        setReviewDays(null);
        reported.current = false;
      } else {
        const loaded = await loadMistakeCard(card.id, gameId, ignoreDue);
        setStats(loaded.stats);
        if (loaded.card) {
          setCard(loaded.card);
          board.current = new Chess(loaded.card.fen);
          setPosition(loaded.card.fen);
          setLastMove(null);
          setSelected(null);
          setStatus("solving");
          reported.current = false;
        } else {
          setCard({ ...card, id: "" });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const finished = status === "solved" || status === "failed" || status === "revealed";
  const hasNext = Boolean(queuedNext) || Boolean(card.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[600px]">
          <div
            className={`relative overflow-hidden rounded-xl border transition-colors ${
              status === "solved"
                ? "border-[var(--accent)]"
                : status === "failed"
                  ? "border-[#e0564b]"
                  : "border-[var(--line)]"
            }`}
          >
            {promo && (
              <PromotionPicker
                side={position.split(" ")[1] === "b" ? "black" : "white"}
                onPick={(piece: PromotionPiece) => {
                  setPromo(null);
                  attempt(promo.from, promo.to, piece);
                }}
                onCancel={() => setPromo(null)}
                compact
              />
            )}
            <Chessboard
              options={{
                id: "mistake-board",
                position,
                boardOrientation: orientation,
                onPieceDrop: onDrop,
                onSquareClick,
                onPieceDrag: ({ square }) => {
                  if (!square || status !== "solving") return;
                  const piece = board.current.get(square as never);
                  if (piece && piece.color === board.current.turn()) setSelected(square);
                },
                onPieceDragCancel: () => setSelected(null),
                squareStyles,
                animationDurationInMs: 220,
                lightSquareStyle: LIGHT_SQUARE,
                darkSquareStyle: DARK_SQUARE,
              }}
            />
          </div>

          {status === "solved" && (
            <div className="animate-pop pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-[#26c2a3] px-4 py-2 text-sm font-semibold text-white shadow-lg">
              Found it — {card.bestSan || "best move"}
            </div>
          )}
          {status === "failed" && (
            <div className="animate-pop pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-[#ca3431] px-4 py-2 text-sm font-semibold text-white shadow-lg">
              Not the move
            </div>
          )}
        </div>

        <p className="min-h-5 text-center text-xs text-[var(--muted)]">
          {status === "solved"
            ? `Solved. This card comes back in ${reviewDays ?? 1} day${(reviewDays ?? 1) === 1 ? "" : "s"}.`
            : status === "failed"
              ? `You played ${card.playedSan}. The engine wanted ${card.bestSan}.`
              : status === "revealed"
                ? `Best was ${card.bestSan}. This counts as a miss.`
                : turn === "w"
                  ? "White to move — find the move you should have played."
                  : "Black to move — find the move you should have played."}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={nextCard}
            disabled={loading}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Loading…" : hasNext ? "Next mistake" : "All caught up"}
          </button>
          {!finished && (
            <button
              onClick={showBest}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Show best move
            </button>
          )}
          {finished && (
            <button
              onClick={reset}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Reset position
            </button>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
            From your games
          </span>
          <p className="mt-2 text-sm font-medium leading-snug">{card.gameLabel}</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Move {Math.ceil(card.ply / 2)} · {card.label}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Link
              href={`/games/${card.gameId}`}
              className="rounded-md border border-[var(--line)] px-2 py-1 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Open the game →
            </Link>
            {card.externalUrl && (
              <a
                href={card.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[var(--line)] px-2 py-1 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
              >
                Original ↗
              </a>
            )}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--muted)]">
            You played {card.playedSan || "a different move"}. One position, one best
            move: this is the exact moment the game turned.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Due now", value: stats.due },
            { label: "Cards", value: stats.total },
            { label: "Mastered", value: stats.mastered },
            { label: "Accuracy", value: `${stats.accuracy}%` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
            >
              <p className="text-lg font-semibold tabular-nums">{item.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {item.label}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[11px] leading-relaxed text-[var(--muted)]">
          <p className="font-medium text-[var(--text)]">
            {dueLabel(stats.nextDueAt, stats.due)}
          </p>
          <p className="mt-1">
            Solved cards return in 1 → 3 → 7 → 21 → 45 → 90 days. A miss comes back
            in half an hour.
          </p>
          {dueAt && status !== "solving" && (
            <p className="mt-2">
              This one:{" "}
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(dueAt))}
            </p>
          )}
        </div>

        <Link
          href="/train"
          className="text-center text-[11px] text-[var(--muted)] underline decoration-dotted hover:text-[var(--text)]"
        >
          ← Back to repertoire training
        </Link>
      </aside>
    </div>
  );
}
