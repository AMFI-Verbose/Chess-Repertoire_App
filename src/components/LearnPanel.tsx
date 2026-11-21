"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import { LESSONS, lessonById } from "@/lib/learn";
import { Engine, scoreToCp } from "@/lib/engine";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";

const START_FEN = new Chess().fen();
const PROGRESS_KEY = "chess.learn.v1";
const COACH_AVATAR = "/bots/marlow.png";

type Message = { id: number; from: "coach" | "you"; text: string };

function readProgress(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export default function LearnPanel({ initialId }: { initialId?: string }) {
  const [lessonId, setLessonId] = useState(initialId ?? LESSONS[0].id);
  const lesson = lessonById(lessonId) ?? LESSONS[0];

  const [index, setIndex] = useState(0);
  const [fen, setFen] = useState(lesson.startFen ?? START_FEN);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"idle" | "ask" | "busy" | "done">("idle");
  const [hintOpen, setHintOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [played, setPlayed] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [completed, setCompleted] = useState<string[]>(readProgress);
  const [runNonce, setRunNonce] = useState(0);

  const gameRef = useRef(new Chess(lesson.startFen));
  const engineRef = useRef<Engine | null>(null);
  const timers = useRef<number[]>([]);
  const messageId = useRef(0);
  const stepRun = useRef<string>("");

  const step = lesson.steps[index];

  const say = useCallback((from: "coach" | "you", text: string) => {
    messageId.current += 1;
    const id = messageId.current;
    setMessages((current) => [...current, { id, from, text }]);
  }, []);

  // Every scheduling goes through here so leaving the page (or switching
  // lessons) cannot leave a stray timeout playing moves on a dead board.
  const later = (fn: () => void, ms: number) => {
    const timer = window.setTimeout(fn, ms);
    timers.current.push(timer);
  };

  function cancelTimers() {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }

  useEffect(() => () => cancelTimers(), []);

  // Restart from a clean board whenever the lesson changes.
  function restart(id = lessonId) {
    cancelTimers();
    const next = lessonById(id) ?? LESSONS[0];
    setLessonId(next.id);
    gameRef.current = new Chess(next.startFen);
    setFen(next.startFen ?? START_FEN);
    setMessages([]);
    setPlayed([]);
    setLastMove(null);
    setIndex(0);
    setMode("idle");
    setHintOpen(false);
    setSelected(null);
    stepRun.current = "";
    setRunNonce((value) => value + 1);
  }

  // Drive one step: talk, then play a move for the student, or hand over the
  // board and wait for their answer.
  useEffect(() => {
    cancelTimers();
    const runKey = `${lesson.id}:${index}`;
    if (stepRun.current === runKey) return; // Strict-mode double mount
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
          // A broken lesson cannot happen: scripts/check-lessons.mts verifies
          // every SAN before it ships. Fail quietly instead of freezing.
        }
        const advance = window.setTimeout(
          () => setIndex((value) => value + 1),
          560,
        );
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

  // Keep the active lesson visible in the horizontal strip on small screens.
  useEffect(() => {
    const el = document.querySelector('[data-learn-active="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [lessonId]);

  useEffect(() => {
    if (mode !== "done") return;
    setCompleted((current) =>
      current.includes(lesson.id) ? current : [...current, lesson.id],
    );
  }, [mode, lesson.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed));
  }, [completed]);

  function getEngine() {
    if (!engineRef.current) engineRef.current = new Engine();
    return engineRef.current;
  }

  /** The coach's arithmetic for a move that is not the one we asked for. */
  async function explainWrong(
    beforeFen: string,
    san: string,
    wanted: string,
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
          // In a position that is already lost every move "keeps" the same
          // score, so comparing evaluations says nothing. Be honest about it.
          verdict =
            "The engine shrugs — the position is already bad, so no move saves it. This lesson is about the pattern, not the score.";
        } else {
          verdict = "Tactically it holds, but it is not the idea this lesson is teaching.";
        }
      } else {
        verdict = "Not the move, exactly.";
      }

      // Show the engine's own first choice only when it actually disagrees on
      // merit; otherwise it reads as noise ("play Kf2" in a lost position).
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
          if (move.san !== san) {
            verdict += ` The engine wants ${move.san}.`;
          }
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

    if (move.san === current.ask) {
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
    void explainWrong(fen, move.san, current.ask, current.hint).catch(() => setMode("ask"));
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
  const progress = completed.includes(lesson.id);
  const nextLesson = LESSONS[LESSONS.findIndex((item) => item.id === lesson.id) + 1];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/openings"
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            ← Opening library
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Learn</h1>
          <p className="text-sm text-[var(--muted)]">
            Five short lessons with a coach who explains every move — and hands
            you the board when it is your turn to find it.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
          <span>
            {completed.length}/{LESSONS.length} finished
          </span>
          <button
            onClick={() => restart(lesson.id)}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 transition hover:border-[var(--accent)]"
          >
            Restart lesson
          </button>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[240px_minmax(0,1fr)_330px]">
        <nav className="flex gap-2 overflow-x-auto pb-1 md:col-span-2 lg:col-span-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {LESSONS.map((item, position) => {
            const active = item.id === lesson.id;
            const done = completed.includes(item.id);
            return (
              <button
                key={item.id}
                data-learn-active={active ? "true" : "false"}
                onClick={() => restart(item.id)}
                className={[
                  "min-w-[210px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition lg:min-w-0 lg:shrink",
                  active
                    ? "border-[var(--accent)] bg-[var(--panel)]"
                    : "border-[var(--line)] hover:border-[var(--muted)]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                    Lesson {position + 1}
                  </span>
                  {done && <span className="text-[11px] text-[var(--accent)]">✓</span>}
                </div>
                <p className="mt-0.5 text-sm font-medium leading-snug">{item.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                  {item.blurb}
                </p>
              </button>
            );
          })}
        </nav>

        <section className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
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

          <div className="flex w-full max-w-[560px] flex-wrap items-center justify-between gap-2">
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
            <p className="w-full max-w-[560px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
              {step.hint}
            </p>
          )}

          {mode === "done" && (
            <div className="w-full max-w-[560px] rounded-xl border border-[var(--accent)]/60 bg-[var(--panel)] px-4 py-3">
              <p className="text-sm font-medium">Lesson finished ✓</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                You played it, not just watched it — that is the part that sticks.
              </p>
              <div className="mt-3 flex items-center gap-3">
                {nextLesson && (
                  <button
                    onClick={() => restart(nextLesson.id)}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b1602]"
                  >
                    Next: {nextLesson.title} →
                  </button>
                )}
                <Link
                  href="/puzzles"
                  className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                >
                  Drill it in puzzles →
                </Link>
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
                {mode === "busy" ? "thinking…" : progress ? "lesson complete" : "your teacher"}
              </p>
            </div>
            {progress && (
              <span className="ml-auto rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                done
              </span>
            )}
          </div>

          <div className="flex max-h-[62vh] flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {messages.map((message) =>
              message.from === "coach" ? (
                <div key={message.id} className="flex gap-2">
                  <div className="mt-0.5 h-1.5 w-1.5 shrink-0 self-start rounded-full bg-[var(--accent)]" />
                  <p className="text-[12.5px] leading-relaxed text-[var(--text)]">
                    {message.text}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="self-end rounded-lg bg-[var(--panel-2)] px-2.5 py-1 font-mono text-[12px]">
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
