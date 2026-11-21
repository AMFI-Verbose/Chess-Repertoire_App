"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import { neighbours, type Lesson } from "@/lib/learn";
import {
  completeLesson,
  loadProgress,
  rememberLesson,
  xpForLesson,
} from "@/lib/learnProgress";
import { Engine, scoreToCp } from "@/lib/engine";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";

const START_FEN = new Chess().fen();
const COACH_AVATAR = "/bots/marlow.png";

type Message = { id: number; from: "coach" | "you"; text: string };

export default function LearnPlayer({
  lesson,
  chapterTitle,
  lessonNumber,
  lessonTotal,
}: {
  lesson: Lesson;
  chapterTitle: string;
  lessonNumber: number;
  lessonTotal: number;
}) {
  const [index, setIndex] = useState(0);
  const [fen, setFen] = useState(lesson.startFen ?? START_FEN);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"idle" | "ask" | "busy" | "done">("idle");
  const [hintOpen, setHintOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [played, setPlayed] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const [finished, setFinished] = useState(false);

  const gameRef = useRef(new Chess(lesson.startFen));
  const engineRef = useRef<Engine | null>(null);
  const timers = useRef<number[]>([]);
  const messageId = useRef(0);
  const stepRun = useRef<string>("");
  const awarded = useRef(false);

  const step = lesson.steps[index];
  const { next, prev } = useMemo(() => neighbours(lesson.id), [lesson.id]);

  const say = useCallback((from: "coach" | "you", text: string) => {
    messageId.current += 1;
    const id = messageId.current;
    setMessages((current) => [...current, { id, from, text }]);
  }, []);

  const later = (fn: () => void, ms: number) => {
    const timer = window.setTimeout(fn, ms);
    timers.current.push(timer);
  };

  function cancelTimers() {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }

  useEffect(() => () => cancelTimers(), []);

  function restart() {
    cancelTimers();
    gameRef.current = new Chess(lesson.startFen);
    setFen(lesson.startFen ?? START_FEN);
    setMessages([]);
    setPlayed([]);
    setLastMove(null);
    setIndex(0);
    setMode("idle");
    setHintOpen(false);
    setSelected(null);
    stepRun.current = "";
    setFinished(false);
    setRunNonce((value) => value + 1);
  }

  // Note the visit, so the overview can offer "Continue" later.
  useEffect(() => {
    rememberLesson(loadProgress(), lesson.id);
  }, [lesson.id]);

  // Drive one step: talk, then play a move for the student, or hand over the
  // board and wait for their answer.
  useEffect(() => {
    cancelTimers();
    const runKey = `${lesson.id}:${index}:${runNonce}`;
    if (stepRun.current === runKey) return;
    stepRun.current = runKey;

    const current = lesson.steps[index];
    if (!current) {
      setMode("done");
      return;
    }

    say("coach", current.say);
    setHintOpen(false);
    setSelected(null);

    if (current.play) {
      setMode("busy");
      const playTimer = window.setTimeout(() => {
        try {
          const move = gameRef.current.move(current.play as string);
          setFen(gameRef.current.fen());
          setPlayed((list) => [...list, move.san]);
          setLastMove({ from: move.from, to: move.to });
        } catch {
          // The build refuses to ship a lesson with an illegal move, so this
          // branch exists only so a bad state cannot freeze the player.
        }
        const advance = window.setTimeout(() => setIndex((value) => value + 1), 560);
        timers.current.push(advance);
      }, 700);
      timers.current.push(playTimer);
      return;
    }

    if (current.ask) {
      setMode("ask");
      return;
    }

    if (index === lesson.steps.length - 1) {
      setMode("done");
      return;
    }

    setMode("idle");
  }, [lesson, index, runNonce, say]);

  // Award the lesson once, the first time the board reaches the end.
  useEffect(() => {
    if (mode !== "done" || awarded.current) return;
    awarded.current = true;
    completeLesson(loadProgress(), lesson.id);
    setFinished(true);
  }, [mode, lesson.id]);

  function getEngine() {
    if (!engineRef.current) engineRef.current = new Engine();
    return engineRef.current;
  }

  /** The coach's arithmetic for a move that is not the one we asked for. */
  async function explainWrong(
    beforeFen: string,
    san: string,
    hint: string | undefined,
  ) {
    const engine = getEngine();
    const after = new Chess(beforeFen);
    try {
      after.move(san);
    } catch {
      setMode("ask");
      return;
    }

    let verdict: string;
    try {
      const [before, afterEval] = await Promise.all([
        engine.search(beforeFen, { movetime: 260, multiPv: 1 }),
        engine.search(after.fen(), { movetime: 260, multiPv: 1 }),
      ]);

      const bestForYou = scoreToCp(before.lines[0], true);
      const theirScore = scoreToCp(afterEval.lines[0], true);
      const yoursForYou = theirScore === null ? null : -theirScore;

      if (before.lines[0]?.mateIn != null && before.lines[0].mateIn > 0) {
        verdict =
          "The engine already sees mate here — anything that is not forcing is a step backwards.";
      } else if (afterEval.lines[0]?.mateIn != null && afterEval.lines[0].mateIn > 0) {
        verdict = `That allows mate in ${Math.abs(afterEval.lines[0].mateIn)}. Look for a check of your own instead.`;
      } else if (bestForYou !== null && yoursForYou !== null) {
        const drop = bestForYou - yoursForYou;
        if (drop >= 250) {
          verdict = `The engine scores that about ${(drop / 100).toFixed(1)} pawns worse — something is left hanging.`;
        } else if (drop >= 80) {
          verdict = `The engine prefers something ${(drop / 100).toFixed(1)} pawns stronger.`;
        } else if (bestForYou < -300) {
          verdict =
            "The engine shrugs — the position is already bad, so no move saves it. This lesson is about the pattern, not the score.";
        } else {
          verdict = "Tactically it holds, but it is not the idea this lesson is teaching.";
        }
      } else {
        verdict = "Not the move, exactly.";
      }

      const bestUci = before.lines[0]?.pv?.[0];
      const worthShowing =
        bestForYou !== null && yoursForYou !== null && bestForYou - yoursForYou >= 80;
      if (bestUci && worthShowing) {
        const board = new Chess(beforeFen);
        try {
          const move = board.move({
            from: bestUci.slice(0, 2),
            to: bestUci.slice(2, 4),
            promotion: bestUci.length > 4 ? bestUci[4] : "q",
          });
          if (move.san !== san) verdict += ` The engine wants ${move.san}.`;
        } catch {
          // Ignore: the verdict still stands without the suggestion.
        }
      }
    } catch {
      verdict = "The coach could not reach the engine — use the hint instead.";
    }

    if (hint) verdict += ` Hint: ${hint}`;
    say("coach", verdict);
    setMode("ask");
  }

  function attempt(from: string, to: string): boolean {
    if (mode !== "ask") return false;
    if (gameRef.current.turn() !== lesson.side) return false;

    const trial = new Chess(fen);
    let move;
    try {
      move = trial.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }

    const current = lesson.steps[index];
    if (!current?.ask) return false;

    const accepted = [current.ask, ...(current.accept ?? [])];
    if (accepted.includes(move.san)) {
      gameRef.current.move({ from, to, promotion: "q" });
      setFen(gameRef.current.fen());
      setPlayed((list) => [...list, move.san]);
      setLastMove({ from, to });
      setSelected(null);
      say("you", move.san);
      if (current.praise) say("coach", current.praise);
      setMode("busy");
      later(() => setIndex((value) => value + 1), 950);
      return true;
    }

    setSelected(null);
    say("you", move.san);
    setMode("busy");
    void explainWrong(fen, move.san, current.hint).catch(() => setMode("ask"));
    return false;
  }

  function showMe() {
    const current = lesson.steps[index];
    if (mode !== "ask" || !current?.ask) return;
    try {
      const move = gameRef.current.move(current.ask);
      setFen(gameRef.current.fen());
      setPlayed((list) => [...list, move.san]);
      setLastMove({ from: move.from, to: move.to });
      say("coach", `Here it is: ${move.san}. ${current.praise ?? ""}`.trim());
      setMode("busy");
      later(() => setIndex((value) => value + 1), 950);
    } catch {
      setMode("ask");
    }
  }

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
    return attempt(sourceSquare, targetSquare);
  }

  function onSquareClick({ square }: { square: string }) {
    if (mode !== "ask") return;
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (selected) {
      attempt(selected, square);
      setSelected(null);
      return;
    }
    const piece = gameRef.current.get(square as never);
    if (piece && piece.color === gameRef.current.turn()) setSelected(square);
  }

  const styles = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    if (lastMove) {
      out[lastMove.from] = { background: "rgba(155,199,0,0.20)" };
      out[lastMove.to] = { background: "rgba(155,199,0,0.32)" };
    }
    if (selected) out[selected] = { background: "rgba(155,199,0,0.40)" };
    return out;
  }, [selected, lastMove]);

  const orientation = lesson.side === "w" ? "white" : "black";
  const stepPercent = Math.round((index / lesson.steps.length) * 100);
  const xp = xpForLesson(lesson);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <Link href="/learn" className="transition-colors hover:text-[var(--text)]">
              ← Learn
            </Link>
            <span>/</span>
            <span>{chapterTitle}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {prev && (
              <Link
                href={`/learn/${prev.id}`}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1 transition hover:border-[var(--accent)]"
              >
                ← {prev.title}
              </Link>
            )}
            <button
              onClick={restart}
              className="rounded-lg border border-[var(--line)] px-2.5 py-1 transition hover:border-[var(--accent)]"
            >
              Restart
            </button>
            {next && (
              <Link
                href={`/learn/${next.id}`}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1 transition hover:border-[var(--accent)]"
              >
                {next.title} →
              </Link>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Lesson {lessonNumber} of {lessonTotal} · {lesson.minutes} min · {xp} XP
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
            <p className="text-sm text-[var(--muted)]">{lesson.blurb}</p>
          </div>
          <div className="min-w-[180px]">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all"
                style={{ width: `${Math.max(3, stepPercent)}%` }}
              />
            </div>
            <p className="mt-1 text-right font-mono text-[10px] text-[var(--muted)]">
              {Math.min(index, lesson.steps.length)}/{lesson.steps.length} steps
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[520px] overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
            <Chessboard
              options={{
                id: "learn-board",
                position: fen,
                boardOrientation: orientation,
                onPieceDrop: onDrop,
                onSquareClick: onSquareClick,
                onPieceDrag: ({ square }) => {
                  if (!square || mode !== "ask") return;
                  const piece = gameRef.current.get(square as never);
                  if (piece && piece.color === gameRef.current.turn()) {
                    setSelected(square);
                  }
                },
                onPieceDragCancel: () => setSelected(null),
                squareStyles: styles,
                animationDurationInMs: 280,
                lightSquareStyle: LIGHT_SQUARE,
                darkSquareStyle: DARK_SQUARE,
              }}
            />
          </div>

          <div className="flex w-full max-w-[520px] flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 font-mono text-[11px] text-[var(--muted)]">
              {played.length > 0 ? played.join(" ") : "start position"}
            </div>
            <div className="flex items-center gap-2">
              {mode === "ask" && (
                <>
                  <button
                    onClick={() => setHintOpen((value) => !value)}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] transition hover:border-[var(--accent)]"
                  >
                    {hintOpen ? "Hide hint" : "Hint"}
                  </button>
                  <button
                    onClick={showMe}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] transition hover:border-[var(--accent)]"
                  >
                    Show me
                  </button>
                </>
              )}
              {mode === "idle" && (
                <button
                  onClick={() => setIndex((value) => value + 1)}
                  className="rounded-lg border border-[var(--accent)] px-3 py-1.5 text-[11px] text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
                >
                  Continue →
                </button>
              )}
            </div>
          </div>

          {mode === "ask" && hintOpen && step?.hint && (
            <p className="w-full max-w-[520px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
              {step.hint}
            </p>
          )}

          {mode === "done" && (
            <div className="w-full max-w-[520px] rounded-xl border border-[var(--accent)]/60 bg-[var(--panel)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Lesson finished ✓ {finished && <span className="text-[var(--accent)]">+{xp} XP</span>}
                </p>
                <Link href="/learn" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
                  All lessons
                </Link>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                You played it, not just watched it — that is the part that sticks.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {next ? (
                  <Link
                    href={`/learn/${next.id}`}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b1602]"
                  >
                    Next: {next.title} →
                  </Link>
                ) : (
                  <Link
                    href="/learn"
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b1602]"
                  >
                    Back to the curriculum →
                  </Link>
                )}
                {lesson.theme && (
                  <Link
                    href={`/puzzles?theme=${lesson.theme}`}
                    className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                  >
                    Drill {lesson.theme} in puzzles →
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-3 py-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={COACH_AVATAR}
              alt="Coach"
              className="h-8 w-8 rounded-full object-cover"
            />
            <div>
              <p className="text-[12px] font-medium leading-tight">Coach</p>
              <p className="text-[10px] leading-tight text-[var(--muted)]">
                {mode === "busy" ? "thinking…" : finished ? "lesson complete" : "your teacher"}
              </p>
            </div>
            {finished && (
              <span className="ml-auto rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                done
              </span>
            )}
          </div>

          <div className="flex max-h-[60vh] flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {messages.map((message) =>
              message.from === "coach" ? (
                <div key={message.id} className="flex gap-2">
                  <div className="mt-0.5 h-1.5 w-1.5 shrink-0 self-start rounded-full bg-[var(--accent)]" />
                  <p className="text-[12.5px] leading-relaxed text-[var(--text)]">
                    {message.text}
                  </p>
                </div>
              ) : (
                <div
                  key={message.id}
                  className="self-end rounded-lg bg-[var(--panel-2)] px-2.5 py-1 font-mono text-[12px]"
                >
                  {message.text}
                </div>
              ),
            )}
            {mode === "busy" && (
              <p className="text-[11px] italic text-[var(--muted)]">Coach is looking…</p>
            )}
            {mode === "ask" && (
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Your move — drag a piece, or click one, then its destination.
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
