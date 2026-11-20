"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import ModeTabs from "@/components/ModeTabs";
import GameSetup, { type StartConfig } from "@/components/GameSetup";
import { saveEngineGame } from "@/app/actions";
import { Engine } from "@/lib/engine";
import { START_FEN, tryMove, turnOf } from "@/lib/chess";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";
import { hintStyles } from "@/lib/boardHints";
import { play } from "@/lib/sound";
import { formatClock, levelByNumber, timeControlById } from "@/lib/gameOptions";

type Status = "playing" | "ended";
type Phase = "setup" | "game";

export default function PlayVsEngine({
  repertoireId,
  name,
  side,
}: {
  repertoireId: string;
  name: string;
  side: "white" | "black";
}) {
  const [phase, setPhase] = useState<Phase>("setup");

  // --- what was chosen in the setup panel ---
  const [level, setLevel] = useState(4);
  const [tcId, setTcId] = useState("5+3");
  const [youPlay, setYouPlay] = useState<"w" | "b">(side === "black" ? "b" : "w");
  const [startFen, setStartFen] = useState(START_FEN);

  // --- the game itself ---
  const [fen, setFen] = useState(START_FEN);
  const [moves, setMoves] = useState<{ san: string; uci: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("playing");
  const [result, setResult] = useState<string | null>(null);
  const [showEval, setShowEval] = useState(true);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  // Clocks are milliseconds remaining, per side. 0 + clockOn = untimed.
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);

  const engineRef = useRef<Engine | null>(null);
  const searchingFor = useRef<string | null>(null);
  const evalToken = useRef(0);
  const statusRef = useRef<Status>("playing");
  const savedRef = useRef<string | null>(null);
  // The last finished game, kept so a failed write can be retried without
  // the player having to re-play it.
  const pendingRef = useRef<{
    list: { san: string; uci: string }[];
    finalFen: string;
    outcome: "win" | "loss" | "draw";
    text: string;
  } | null>(null);
  const tickRef = useRef<number>(Date.now());

  statusRef.current = status;

  const levelInfo = levelByNumber(level);
  const timeControl = timeControlById(tcId);
  const clockOn = timeControl.initial !== null;

  const getEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new Engine();
    return engineRef.current;
  }, []);

  // The worker is a real resource; drop it when you leave the page.
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  const startGame = useCallback((config: StartConfig) => {
    const resolved: "w" | "b" =
      config.colour === "random"
        ? Math.random() < 0.5
          ? "w"
          : "b"
        : config.colour === "white"
          ? "w"
          : "b";
    const start = config.fen ?? START_FEN;
    const control = timeControlById(config.tcId);
    const baseMs = control.initial === null ? 0 : control.initial * 1000;

    setLevel(config.level);
    setTcId(config.tcId);
    setYouPlay(resolved);
    setStartFen(start);

    setFen(start);
    setMoves([]);
    setSelected(null);
    setStatus("playing");
    setResult(null);
    setEvalCp(null);
    setSavedId(null);
    setSaveError(false);
    pendingRef.current = null;
    setWhiteMs(baseMs);
    setBlackMs(baseMs);

    searchingFor.current = null;
    savedRef.current = null;
    tickRef.current = Date.now();
    setPhase("game");
  }, []);

  /** Write the finished game to the database — exactly once per game. */
  const persist = useCallback(
    (
      list: { san: string; uci: string }[],
      finalFen: string,
      outcome: "win" | "loss" | "draw",
      text: string,
    ) => {
      if (savedRef.current) return;
      // Resigning before the first move is not a game worth remembering.
      if (list.length === 0) return;
      pendingRef.current = { list, finalFen, outcome, text };
      savedRef.current = "saving";
      setSaveError(false);
      saveEngineGame({
        playerColor: youPlay === "w" ? "white" : "black",
        skill: levelInfo.skill,
        level: levelInfo.level,
        timeControl: clockOn ? tcId : "unlimited",
        startFen: startFen === START_FEN ? "" : startFen,
        result: outcome,
        resultText: text,
        san: list.map((move) => move.san),
        fen: finalFen,
      })
        .then(({ id }) => {
          savedRef.current = id;
          setSavedId(id);
        })
        .catch(() => {
          // The move list is still in pendingRef: show the failure rather than
          // a spinner that never finishes.
          savedRef.current = null;
          setSaveError(true);
        });
    },
    [youPlay, levelInfo.skill, levelInfo.level, tcId, clockOn, startFen],
  );

  const retrySave = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    persist(pending.list, pending.finalFen, pending.outcome, pending.text);
  }, [persist]);

  /** Shared bookkeeping for both human and engine moves. */
  const commitMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const current = fen;
      const result = tryMove(current, from, to, promotion ?? "q");
      if (!result) return false;

      const next = new Chess(result.fen);
      const nextMoves = [...moves, { san: result.san, uci: result.uci }];
      setFen(result.fen);
      setMoves(nextMoves);
      play(result.captured ? "capture" : result.check ? "check" : "move");

      // Increment goes to the side that just moved, and only after the move —
      // the same order a real clock uses.
      if (clockOn) {
        const incrementMs = timeControl.increment * 1000;
        if (turnOf(current) === "w") {
          setWhiteMs((ms) => Math.max(0, ms) + incrementMs);
        } else {
          setBlackMs((ms) => Math.max(0, ms) + incrementMs);
        }
      }

      if (next.isGameOver()) {
        setStatus("ended");

        if (next.isCheckmate()) {
          // Whoever is to move in the final position is the one who got mated.
          const mated = turnOf(result.fen);
          const won = mated !== youPlay;
          const text = won ? "You won by checkmate" : "Stockfish won by checkmate";
          setResult(text);
          persist(nextMoves, result.fen, won ? "win" : "loss", text);
        } else {
          const text = next.isStalemate()
            ? "Draw by stalemate"
            : next.isInsufficientMaterial()
              ? "Draw — insufficient material"
              : "Draw";
          setResult(text);
          persist(nextMoves, result.fen, "draw", text);
        }
      }
      return true;
    },
    [fen, moves, persist, youPlay, clockOn, timeControl.increment],
  );

  // ---- the engine's turn -------------------------------------------------
  useEffect(() => {
    if (phase !== "game") return;
    if (status !== "playing") return;
    if (turnOf(fen) === youPlay) return;
    if (searchingFor.current === fen) return;

    searchingFor.current = fen;
    setThinking(true);

    let cancelled = false;

    getEngine()
      .search(fen, { movetime: levelInfo.movetime, skill: levelInfo.skill })
      .then((response) => {
        if (cancelled || statusRef.current !== "playing") return;
        const uci = response.bestmove;
        if (!uci || uci.startsWith("(")) {
          setStatus("ended");
          setResult("Stockfish resigned");
          persist(moves, fen, "win", "Stockfish resigned");
          return;
        }
        commitMove(uci.slice(0, 2), uci.slice(2, 4), uci.length > 4 ? uci[4] : "q");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setThinking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [phase, fen, youPlay, status, levelInfo, commitMove, getEngine, moves, persist]);

  // ---- clock -------------------------------------------------------------
  useEffect(() => {
    if (phase !== "game" || status !== "playing" || !clockOn) return;

    tickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - tickRef.current;
      tickRef.current = now;

      // The side to move burns its own clock — including while Stockfish thinks.
      if (turnOf(fen) === "w") {
        setWhiteMs((ms) => Math.max(0, ms - elapsed));
      } else {
        setBlackMs((ms) => Math.max(0, ms - elapsed));
      }
    }, 100);

    return () => clearInterval(timer);
  }, [phase, status, clockOn, fen]);

  // ---- flag --------------------------------------------------------------
  useEffect(() => {
    if (phase !== "game" || status !== "playing" || !clockOn) return;
    if (whiteMs > 0 && blackMs > 0) return;

    const flagged = whiteMs <= 0 ? "w" : "b";
    const won = flagged !== youPlay;
    const text = won ? "Stockfish ran out of time" : "You ran out of time";
    setStatus("ended");
    setResult(text);
    persist(moves, fen, won ? "win" : "loss", text);
  }, [phase, status, clockOn, whiteMs, blackMs, youPlay, moves, fen, persist]);

  // ---- evaluation bar ----------------------------------------------------
  useEffect(() => {
    if (!showEval || phase !== "game") return;
    const token = evalToken.current + 1;
    evalToken.current = token;

    getEngine()
      .search(fen, { movetime: 260, multiPv: 1, skill: 20 })
      .then((response) => {
        if (evalToken.current !== token) return;
        const line = response.lines[0];
        if (!line) return;
        if (line.mateIn !== null) {
          setEvalCp(line.mateIn > 0 ? 9000 : -9000);
        } else if (line.scoreCp !== null) {
          setEvalCp(turnOf(fen) === "w" ? line.scoreCp : -line.scoreCp);
        }
      })
      .catch(() => undefined);
  }, [fen, showEval, phase, getEngine]);

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
    if (status !== "playing") return false;
    if (thinking) return false;
    if (turnOf(fen) !== youPlay) return false;
    return commitMove(sourceSquare, targetSquare);
  }

  /** chess.com behaviour: click a piece, then click its destination. */
  function onSquareClick({ square }: { square: string }) {
    if (status !== "playing" || thinking) return;
    if (turnOf(fen) !== youPlay) return;

    if (selected === square) {
      setSelected(null);
      return;
    }

    if (selected) {
      const moved = commitMove(selected, square);
      setSelected(null);
      if (moved) return;
    }

    const board = new Chess(fen);
    const piece = board.get(square as never);
    if (piece && piece.color === board.turn()) {
      setSelected(square);
      play("navigate");
    } else {
      setSelected(null);
    }
  }

  function undo() {
    if (moves.length === 0) return;
    // Take back your move *and* the engine's reply when there is one.
    const strip = turnOf(fen) === youPlay ? 2 : 1;
    const kept = moves.slice(0, Math.max(0, moves.length - strip));
    const replay = new Chess(startFen);
    for (const move of kept) {
      replay.move({
        from: move.uci.slice(0, 2),
        to: move.uci.slice(2, 4),
        promotion: move.uci.length > 4 ? move.uci[4] : "q",
      });
    }
    searchingFor.current = null;
    setFen(replay.fen());
    setMoves(kept);
    setStatus("playing");
    setResult(null);
    if (status === "ended") {
      savedRef.current = null;
      setSavedId(null);
    }
  }

  const lastMove = moves.length > 0 ? moves[moves.length - 1].uci : null;

  const squareStyles = hintStyles(fen, {
    selected,
    lastMove,
    legalMovesFor: selected,
  });

  const whiteShare =
    evalCp === null ? 0.5 : 0.5 + Math.max(-1, Math.min(1, evalCp / 1000)) / 2;
  const rows = groupMoves(moves);

  const yourMs = youPlay === "w" ? whiteMs : blackMs;
  const theirMs = youPlay === "w" ? blackMs : whiteMs;
  const yourTurn = turnOf(fen) === youPlay;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            ← All repertoires
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-[var(--muted)]">
            {phase === "game"
              ? `vs Stockfish · ${levelInfo.name} (≈${levelInfo.rating}) · ${
                  clockOn ? `${timeControl.label} ${timeControl.category}` : "no clock"
                }${startFen === START_FEN ? "" : " · custom position"}`
              : "New game — pick an opponent, a clock and a start"}
          </p>
        </div>
        <ModeTabs repertoireId={repertoireId} active="play" />
      </header>

      {phase === "setup" ? (
        <div className="flex justify-center">
          <GameSetup onStart={startGame} defaultLevel={4} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex flex-col items-center gap-3">
            {clockOn && (
              <div className="grid w-full max-w-[600px] grid-cols-2 gap-2">
                <ClockCard
                  label="Stockfish"
                  sub={`L${levelInfo.level}`}
                  value={formatClock(theirMs)}
                  active={status === "playing" && !yourTurn}
                  low={theirMs < 20000}
                />
                <ClockCard
                  label="You"
                  sub={youPlay === "w" ? "white" : "black"}
                  value={formatClock(yourMs)}
                  active={status === "playing" && yourTurn}
                  low={yourMs < 20000}
                />
              </div>
            )}

            <div className="w-full max-w-[600px] overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
              <Chessboard
                options={{
                  id: "play-board",
                  position: fen,
                  boardOrientation: youPlay === "w" ? "white" : "black",
                  onPieceDrop: onDrop,
                  onSquareClick: onSquareClick,
                  onPieceDrag: ({ square }) => {
                    if (!square) return;
                    const board = new Chess(fen);
                    const piece = board.get(square as never);
                    if (piece && piece.color === board.turn()) setSelected(square);
                  },
                  onPieceDragCancel: () => setSelected(null),
                  squareStyles,
                  animationDurationInMs: 280,
                  lightSquareStyle: LIGHT_SQUARE,
                  darkSquareStyle: DARK_SQUARE,
                }}
              />
            </div>

            <p className="text-xs text-[var(--muted)]">
              {result
                ? result
                : thinking
                  ? "Stockfish is thinking…"
                  : yourTurn
                    ? "Your move"
                    : "…"}
            </p>
          </section>

          <aside className="flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Evaluation</span>
                <span className="font-mono text-[var(--text)]">
                  {evalCp === null ? "—" : formatEval(evalCp)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#3a3733]">
                <div
                  className="h-full bg-[#f0d9b5] transition-all duration-300"
                  style={{ width: `${whiteShare * 100}%` }}
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={showEval}
                  onChange={(event) => setShowEval(event.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Show evaluation
              </label>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Game
              </p>
              <p className="mt-1 text-sm font-medium">
                Stockfish · {levelInfo.name}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {clockOn ? `${timeControl.label} ${timeControl.category}` : "No clock"} ·
                ≈{levelInfo.rating} Elo · skill {levelInfo.skill}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPhase("setup")}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--text)]"
              >
                New game
              </button>
              <button
                onClick={undo}
                disabled={moves.length === 0}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--text)] disabled:opacity-40"
              >
                Take back
              </button>
              <button
                onClick={() => {
                  if (status !== "playing") return;
                  setStatus("ended");
                  setResult("You resigned");
                  persist(moves, fen, "loss", "You resigned");
                }}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--text)]"
              >
                Resign
              </button>
            </div>

            {status === "ended" && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Game over
                </p>
                <p className="mt-1 text-sm font-medium">{result}</p>
                {moves.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {Math.ceil(moves.length / 2)} moves · Stockfish {levelInfo.name}
                    {clockOn ? ` · ${timeControl.label}` : ""}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {savedId ? (
                    <Link
                      href={`/games/${savedId}`}
                      className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[#0b1602]"
                    >
                      Review this game →
                    </Link>
                  ) : moves.length > 0 ? (
                    saveError ? (
                      <button
                        onClick={retrySave}
                        className="rounded-lg border border-[#e0564b] px-3 py-2 text-xs text-[#e0564b]"
                      >
                        Couldn&apos;t save — retry
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">
                        Saving to history…
                      </span>
                    )
                  ) : null}
                  <button
                    onClick={() => setPhase("setup")}
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs"
                  >
                    Rematch
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Moves
              </p>
              {rows.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No moves yet.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto font-mono text-xs">
                  {rows.map((row) => (
                    <div key={row.number} className="flex gap-3 py-0.5">
                      <span className="w-8 shrink-0 text-[var(--muted)]">
                        {row.number}.
                      </span>
                      <span className="w-16">{row.white}</span>
                      <span className="w-16">{row.black ?? ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function ClockCard({
  label,
  sub,
  value,
  active,
  low,
}: {
  label: string;
  sub: string;
  value: string;
  active: boolean;
  low: boolean;
}) {
  // Border colour is inline, not a Tailwind utility, so the active state cannot
  // depend on utility ordering — and there is no colour transition: a clock
  // changes side instantly, and an animated border reads as lag.
  return (
    <div
      className="flex items-center justify-between rounded-lg border px-3 py-2"
      style={{
        borderColor: active ? "var(--accent)" : "var(--line)",
        background: active ? "var(--panel-2)" : "var(--panel)",
      }}
    >
      <div className="flex flex-col">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-[var(--muted)]">
          {sub}
          {active ? " · to move" : ""}
        </span>
      </div>
      <span
        className="font-mono text-lg tabular-nums"
        style={{
          color: low ? "#e0564b" : active ? "var(--text)" : "var(--muted)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 9000) return cp > 0 ? "#" : "-#";
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function groupMoves(moves: { san: string; uci: string }[]) {
  const rows: { number: number; white: string; black?: string }[] = [];
  moves.forEach((move, index) => {
    const number = Math.floor(index / 2) + 1;
    if (index % 2 === 0) {
      rows.push({ number, white: move.san });
    } else {
      rows[rows.length - 1].black = move.san;
    }
  });
  return rows;
}
