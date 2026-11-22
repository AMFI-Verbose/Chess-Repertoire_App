"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

import { gradeCard } from "@/app/train/actions";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";
import type { TrainerCard } from "@/lib/trainer";

type Phase = "asking" | "right" | "wrong" | "done";

function describeInterval(ms: number): string {
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "later today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export default function RepertoireTrainer({
  repertoireId,
  name,
  side,
  cards,
}: {
  repertoireId: string;
  name: string;
  side: "white" | "black";
  cards: TrainerCard[];
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("asking");
  const [fen, setFen] = useState(cards[0]?.fen ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; good: boolean } | null>(null);
  const [stats, setStats] = useState({ right: 0, wrong: 0 });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const card = cards[index];

  const board = useMemo(() => new Chess(card?.fen ?? new Chess().fen()), [card?.fen]);

  useEffect(() => {
    if (!card) return;
    setFen(card.fen);
    setSelected(null);
    setLastMove(null);
    setFeedback(null);
    setSaved(null);
    setPhase("asking");
  }, [card]);

  const total = cards.length;

  const answer = useCallback(async (from: string, to: string) => {
    if (!card || phase !== "asking" || pending) return;
    const trial = new Chess(card.fen);
    let move;
    try {
      move = trial.move({ from, to, promotion: "q" });
    } catch {
      return;
    }

    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const hit = card.answers.find((candidate) => candidate.uci === uci);
    setPending(true);
    setSelected(null);

    try {
      if (hit) {
        setFen(trial.fen());
        setLastMove({ from, to });
        setPhase("right");
        setStats((value) => ({ ...value, right: value.right + 1 }));
        setFeedback({ text: `${hit.san} — that is the move.`, good: true });
        const result = await gradeCard({ nodeId: card.nodeId, correct: true });
        const delay = result.dueAt ? new Date(result.dueAt).getTime() - Date.now() : 0;
        setSaved(`Next review ${describeInterval(delay)}.`);
      } else {
        const expected = card.answers[0];
        const correct = new Chess(card.fen);
        try {
          correct.move(expected.uci);
        } catch {
          // The answer came from the same tree, so this cannot fail; guard anyway.
        }
        setFen(correct.fen());
        setLastMove({
          from: expected.uci.slice(0, 2),
          to: expected.uci.slice(2, 4),
        });
        setPhase("wrong");
        setStats((value) => ({ ...value, wrong: value.wrong + 1 }));
        setFeedback({
          text: `${move.san} is not what you saved. You play ${expected.san}.`,
          good: false,
        });
        const result = await gradeCard({ nodeId: card.nodeId, correct: false });
        setSaved(result.interval === 1 ? "This position comes back later today." : `Next review in ${result.interval} days.`);
      }
    } catch {
      setFeedback({ text: "Could not save that answer — try again.", good: false });
      setPhase("asking");
    } finally {
      setPending(false);
    }
  }, [card, phase, pending]);

  function onDrop({
    sourceSquare,
    targetSquare,
  }: {
    piece: { pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    setSelected(null);
    if (!targetSquare) return false;
    void answer(sourceSquare, targetSquare);
    return true;
  }

  function onSquareClick({ square }: { square: string }) {
    if (phase !== "asking") return;
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (selected) {
      void answer(selected, square);
      return;
    }
    const piece = board.get(square as never);
    if (piece && piece.color === board.turn()) setSelected(square);
  }

  function reveal() {
    if (!card || phase !== "asking" || pending) return;
    const expected = card.answers[0];
    const trial = new Chess(card.fen);
    try {
      trial.move(expected.uci);
    } catch {
      return;
    }
    setFen(trial.fen());
    setLastMove({ from: expected.uci.slice(0, 2), to: expected.uci.slice(2, 4) });
    setPhase("wrong");
    setFeedback({ text: `It was ${expected.san}.`, good: false });
    setStats((value) => ({ ...value, wrong: value.wrong + 1 }));
    setPending(true);
    void gradeCard({ nodeId: card.nodeId, correct: false })
      .then((result) => setSaved(`Next review in ${result.interval} day${result.interval === 1 ? "" : "s"}.`))
      .catch(() => setSaved(null))
      .finally(() => setPending(false));
  }

  function next() {
    if (index + 1 >= total) {
      setPhase("done");
      return;
    }
    setIndex(index + 1);
  }

  const styles = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    if (lastMove) {
      out[lastMove.from] = { background: "rgba(155,199,0,0.18)" };
      out[lastMove.to] = { background: "rgba(155,199,0,0.35)" };
    }
    if (selected) out[selected] = { background: "rgba(155,199,0,0.40)" };
    return out;
  }, [selected, lastMove]);

  if (!card || phase === "done") {
    const answered = stats.right + stats.wrong;
    const pct = answered ? Math.round((stats.right / answered) * 100) : 0;
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-[11px] uppercase tracking-wider text-[var(--accent)]">session complete</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}</h1>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Positions", value: answered },
            { label: "Correct", value: stats.right },
            { label: "Accuracy", value: `${pct}%` },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
              <p className="text-xl font-semibold tabular-nums">{item.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          {pct >= 80
            ? "That is recall, not recognition. The intervals stretch as you keep getting these right."
            : "Positions you missed come back in a few hours. Run the session again then — that second pass is where it sticks."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/train" className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[#0b1602]">
            Back to the trainer
          </Link>
          <Link
            href={`/r/${repertoireId}`}
            className="rounded-lg border border-[var(--line)] px-3.5 py-2 text-sm transition hover:border-[var(--accent)]"
          >
            Open the repertoire
          </Link>
          {stats.wrong > 0 && (
            <Link
              href={`/train/${repertoireId}`}
              className="rounded-lg border border-[var(--line)] px-3.5 py-2 text-sm transition hover:border-[var(--accent)]"
            >
              Run it again
            </Link>
          )}
        </div>
      </div>
    );
  }

  const stepPercent = Math.round((index / total) * 100);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <Link href="/train" className="transition-colors hover:text-[var(--text)]">
              ← Trainer
            </Link>
            <span>/</span>
            <span>{name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--accent)]">
              pro
            </span>
            <Link href={`/r/${repertoireId}`} className="rounded-lg border border-[var(--line)] px-2.5 py-1 transition hover:border-[var(--accent)]">
              Edit repertoire
            </Link>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {card.openingEco ? `${card.openingEco} · ` : ""}
              {side === "white" ? "you are White" : "you are Black"} · move {Math.floor(card.ply / 2) + 1}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
              {card.openingName ?? "Your repertoire"}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
              {card.line.length > 0 ? card.line.join(" ") : "start position"}
            </p>
          </div>
          <div className="min-w-[190px]">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.max(3, stepPercent)}%` }} />
            </div>
            <p className="mt-1 text-right font-mono text-[10px] text-[var(--muted)]">
              {index + 1}/{total} · {phase === "asking" ? "your move" : "revealed"}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[520px] overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
            <Chessboard
              options={{
                id: "train-board",
                position: fen,
                boardOrientation: side,
                onPieceDrop: onDrop,
                onSquareClick,
                squareStyles: styles,
                animationDurationInMs: 220,
                lightSquareStyle: LIGHT_SQUARE,
                darkSquareStyle: DARK_SQUARE,
              }}
            />
          </div>

          <div className="flex w-full max-w-[520px] flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 font-mono text-[11px] text-[var(--muted)]">
              {phase === "asking" ? "what did you save here?" : saved ?? "saved"}
            </div>
            {pending && <span className="text-[10px] text-[var(--muted)]">saving…</span>}
          </div>
        </section>

        <aside className="flex flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] px-3 py-2.5">
            <p className="text-[12px] font-medium">Your line</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--muted)]">
              {card.answers.length > 1
                ? `${card.answers.length} moves are saved here — any of them counts.`
                : "One move is saved here."}
            </p>
          </div>
          <div className="flex-1 p-3">
            {feedback && (
              <p
                className="rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
                style={{
                  background: feedback.good ? "rgba(155,199,0,0.12)" : "rgba(226,90,72,0.12)",
                  color: feedback.good ? "var(--accent)" : "var(--text)",
                }}
              >
                {feedback.text}
              </p>
            )}
            {phase === "asking" && (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                Play the move from memory. Drag a piece, or click it and its
                destination.
              </p>
            )}
            {phase !== "asking" && card.answers.length > 1 && (
              <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">
                also saved: {card.answers.slice(1).map((item) => item.san).join(", ")}
              </p>
            )}
          </div>
          <div className="border-t border-[var(--line)] p-3">
            {phase === "asking" ? (
              <div className="flex gap-2">
                <button
                  onClick={reveal}
                  disabled={pending}
                  className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-xs transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  Show me
                </button>
                <button
                  onClick={next}
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]"
                >
                  Skip
                </button>
              </div>
            ) : (
              <button
                onClick={next}
                className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[#0b1602]"
              >
                {index + 1 >= total ? "Finish" : "Next position →"}
              </button>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
