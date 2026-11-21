"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import ModeTabs from "@/components/ModeTabs";
import GameSetup, { type StartConfig } from "@/components/GameSetup";
import { saveEngineGame, type SaveGameInput } from "@/app/actions";
import { Engine } from "@/lib/engine";
import { START_FEN, tryMove, turnOf } from "@/lib/chess";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";
import { hintStyles } from "@/lib/boardHints";
import { play } from "@/lib/sound";
import { formatClock, levelByNumber, timeControlById } from "@/lib/gameOptions";
import { DEFAULT_BOT, botById, chooseBotMove } from "@/lib/bots";
import { botChatLine, botReply, type ChatEvent } from "@/lib/botChat";
import BotChat, { type ChatMessage } from "@/components/BotChat";

/** Where finished games wait when the server will not take them. */
const QUEUE_KEY = "chess.unsaved.games.v1";

function readQueue(): SaveGameInput[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SaveGameInput[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(list: SaveGameInput[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(QUEUE_KEY);
    else window.localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or disabled — the in-memory retry still works.
  }
}

type Status = "playing" | "ended";
type Phase = "setup" | "game";

export default function PlayVsEngine({
  repertoireId,
  name = "Play",
  side = "white",
}: {
  /** Set when playing from a repertoire's Play tab; absent on /play. */
  repertoireId?: string;
  name?: string;
  side?: "white" | "black";
}) {
  const [phase, setPhase] = useState<Phase>("setup");

  // --- what was chosen in the setup panel ---
  const [opponent, setOpponent] = useState<"stockfish" | "character">("stockfish");
  // Remembered so the setup screen reopens where you left off.
  const [lastConfig, setLastConfig] = useState<StartConfig | null>(null);
  const [level, setLevel] = useState(4);
  const [botId, setBotId] = useState(DEFAULT_BOT.id);
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
  const [saveErrorText, setSaveErrorText] = useState<string | null>(null);
  // Finished games that the server refused. They wait here — across reloads —
  // until a write succeeds, so a flaky moment never costs you the game.
  const [queued, setQueued] = useState(0);
  // A pawn reaching the last rank waits here until you pick a piece.
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  // Bumped by every new game so the greeting fires once per game, not once per
  // empty move list (the engine can move before the greeting timer runs).
  const [gameSeq, setGameSeq] = useState(0);
  const chatId = useRef(0);
  const lastSpokeAt = useRef(-99);

  // Clocks are milliseconds remaining, per side. 0 + clockOn = untimed.
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);

  const engineRef = useRef<Engine | null>(null);
  const searchingFor = useRef<string | null>(null);
  const epoch = useRef(0);
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

  const bot = botById(botId);
  // "stockfish" is the bare engine ladder; "character" is the same engine with
  // a face, a handicap and opinions. Everything below branches on this.
  const isCharacter = opponent === "character";
  const engineLevel = levelByNumber(level);
  const opponentName = isCharacter ? bot.name : "Stockfish";
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

    setLastConfig(config);
    setOpponent(config.opponent);
    setLevel(config.level);
    setBotId(config.botId || DEFAULT_BOT.id);
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
    setSaveErrorText(null);
    setPromotion(null);
    setResultDismissed(false);
    setChat([]);
    setGameSeq((value) => value + 1);
    lastSpokeAt.current = -99;
    pendingRef.current = null;
    setWhiteMs(baseMs);
    setBlackMs(baseMs);

    searchingFor.current = null;
    epoch.current += 1;
    savedRef.current = null;
    tickRef.current = Date.now();
    setPhase("game");
  }, []);

  /** Append a line to the chat log, from either side. */
  const pushChat = useCallback((from: "bot" | "you", text: string) => {
    chatId.current += 1;
    setChat((previous) => [
      ...previous.slice(-40),
      { id: chatId.current, from, text },
    ]);
  }, []);

  /**
   * Let the character react to something that just happened. Quiet moves are
   * ignored and reactions are spaced out, so the chat reads like a person
   * watching the game rather than a move-by-move commentator.
   */
  const speak = useCallback(
    (event: ChatEvent, force = false, detail?: string) => {
      // The bare engine has nothing to say.
      if (!isCharacter) return;
      if (!force && moves.length - lastSpokeAt.current < 4) return;
      const line = botChatLine(bot, event, { detail });
      if (!line) return;
      lastSpokeAt.current = moves.length;
      // A beat of "thinking" makes it feel typed rather than triggered.
      setTimeout(() => pushChat("bot", line), 700);
    },
    [bot, isCharacter, moves.length, pushChat],
  );

  // A new game opens with the character saying hello.
  useEffect(() => {
    if (phase !== "game" || !isCharacter) return;
    const line = botChatLine(bot, "start");
    if (!line) return;
    const timer = setTimeout(() => pushChat("bot", line), 700);
    return () => clearTimeout(timer);
  }, [phase, gameSeq, bot, isCharacter, pushChat]);

  /** What the finished result means for this character. */
  const endEvent = useCallback((text: string | null): ChatEvent => {
    if (!text) return "draw";
    if (text.includes("Draw")) return "draw";
    if (text.includes("You resigned") || text.includes("You ran out of time")) {
      return "you-lose";
    }
    if (text.includes("Stockfish won")) return "you-lose";
    return "you-win";
  }, []);

  useEffect(() => {
    if (status !== "ended" || !result) return;
    speak(endEvent(result), true);
  }, [status, result, speak, endEvent]);

  /** You type, they answer a moment later. */
  const sendChat = useCallback(
    (text: string) => {
      pushChat("you", text);
      const reply = botReply(bot, text);
      setTimeout(() => pushChat("bot", reply), 850);
    },
    [bot, pushChat],
  );

  /** Finished games waiting for a write that worked. */
  const enqueue = useCallback((payload: SaveGameInput) => {
    const list = readQueue();
    list.push(payload);
    writeQueue(list);
    setQueued(list.length);
  }, []);

  /** Try the waiting games again; whatever succeeds leaves the queue. */
  const flushQueue = useCallback(async () => {
    const list = readQueue();
    if (list.length === 0) {
      setQueued(0);
      return;
    }
    const leftovers: SaveGameInput[] = [];
    for (const payload of list) {
      try {
        await saveEngineGame(payload);
      } catch {
        leftovers.push(payload);
      }
    }
    writeQueue(leftovers);
    setQueued(leftovers.length);
    if (list.length > leftovers.length) {
      // Something got through — reload the list so it shows up.
      window.location.reload();
    }
  }, []);

  // On mount, quietly retry anything a previous session could not save.
  useEffect(() => {
    const waiting = readQueue();
    setQueued(waiting.length);
    if (waiting.length > 0) void flushQueue();
  }, [flushQueue]);

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
      const payload: SaveGameInput = {
        playerColor: youPlay === "w" ? "white" : "black",
        skill: isCharacter ? bot.play.skill : engineLevel.skill,
        level: isCharacter ? bot.level : engineLevel.level,
        botId: isCharacter ? bot.id : undefined,
        timeControl: clockOn ? tcId : "unlimited",
        startFen: startFen === START_FEN ? "" : startFen,
        result: outcome,
        resultText: text,
        san: list.map((move) => move.san),
        fen: finalFen,
      };
      savedRef.current = "saving";
      setSaveError(false);
      setSaveErrorText(null);
      saveEngineGame(payload)
        .then(({ id }) => {
          savedRef.current = id;
          setSavedId(id);
        })
        .catch((error: unknown) => {
          const reason =
            error instanceof Error
              ? error.message.replace(/^Error: /, "").slice(0, 140)
              : "The server refused the write.";
          // The move list is still in pendingRef, and it also goes to local
          // storage so even a reload cannot lose a finished game.
          savedRef.current = null;
          setSaveError(true);
          setSaveErrorText(reason);
          enqueue(payload);
        });
    },
    [youPlay, isCharacter, bot.play.skill, bot.level, bot.id, engineLevel.skill, engineLevel.level, tcId, clockOn, startFen, enqueue],
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

      // The characters only comment on things worth commenting on.
      const moverIsYou = turnOf(current) === youPlay;
      if (promotion && moverIsYou) {
        speak("you-promoted");
      } else if (result.captured) {
        speak(moverIsYou ? "you-captured" : "i-captured");
      } else if (result.check) {
        speak(moverIsYou ? "you-checked" : "i-checked");
      }

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
    [fen, moves, persist, youPlay, clockOn, timeControl.increment, speak],
  );

  // ---- the engine's turn -------------------------------------------------
  useEffect(() => {
    if (phase !== "game") return;
    if (status !== "playing") return;
    if (turnOf(fen) === youPlay) return;
    if (searchingFor.current === fen) return;

    searchingFor.current = fen;
    setThinking(true);

    // If the board is rewound while this search is in flight, its answer is
    // about a position that no longer exists — drop it instead of playing it.
    const startedIn = epoch.current;
    let cancelled = false;

    const searched = isCharacter
      ? chooseBotMove(getEngine(), fen, bot)
      : getEngine()
          .search(fen, {
            movetime: engineLevel.movetime,
            skill: engineLevel.skill,
          })
          .then((result) => result.bestmove);

    searched
      .then((uci) => {
        if (cancelled || statusRef.current !== "playing") return;
        if (epoch.current !== startedIn) return;
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
  }, [phase, fen, youPlay, status, isCharacter, bot, engineLevel.movetime, engineLevel.skill, commitMove, getEngine, moves, persist]);

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

  /**
   * Does this move promote? A pawn moving to rank 1 or 8 must choose a piece —
   * auto-queening quietly removes underpromotion from the game.
   */
  function needsPromotion(from: string, to: string): boolean {
    const board = new Chess(fen);
    const piece = board.get(from as never);
    if (!piece || piece.type !== "p") return false;
    return to[1] === "8" || to[1] === "1";
  }

  function attemptMove(from: string, to: string): boolean {
    if (needsPromotion(from, to)) {
      setPromotion({ from, to });
      return true;
    }
    return commitMove(from, to);
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
    if (status !== "playing") return false;
    if (thinking) return false;
    if (turnOf(fen) !== youPlay) return false;
    return attemptMove(sourceSquare, targetSquare);
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
      const moved = attemptMove(selected, square);
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
    // Bump first: any engine search already in flight is now obsolete.
    epoch.current += 1;
    setThinking(false);
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
            {repertoireId ? "← All repertoires" : "← Home"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {repertoireId ? name : "Play"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {phase === "game"
              ? `vs ${opponentName}${
                  isCharacter ? ` (≈${bot.rating})` : ` · level ${engineLevel.level} (${engineLevel.name})`
                } · ${
                  clockOn ? `${timeControl.label} ${timeControl.category}` : "no clock"
                }${startFen === START_FEN ? "" : " · custom position"}`
              : "Pick Stockfish or a character, a clock and a colour — or click a quick pairing."}
          </p>
        </div>
        {repertoireId ? <ModeTabs repertoireId={repertoireId} active="play" /> : null}
      </header>

      {phase === "setup" ? (
        <div className="mx-auto w-full max-w-2xl">
          <GameSetup
            onStart={startGame}
            defaultLevel={4}
            initial={
              lastConfig
                ? {
                    opponent: lastConfig.opponent,
                    level: lastConfig.level,
                    botId: lastConfig.botId,
                    tcId: lastConfig.tcId,
                    colour: lastConfig.colour,
                  }
                : null
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="relative flex flex-col items-center gap-3">
            {status === "ended" && !resultDismissed && (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/60 px-4">
                <div className="relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl">
                  <button
                    onClick={() => setResultDismissed(true)}
                    aria-label="Dismiss"
                    className="absolute right-3 top-3 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    ✕
                  </button>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Game over
                  </p>
                  <div className="mt-1 flex items-center gap-2.5">
                    {isCharacter ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bot.avatar}
                        alt={bot.name}
                        className="h-9 w-9 rounded-full object-cover"
                        style={{ boxShadow: `0 0 0 1px ${bot.accent}` }}
                      />
                    ) : null}
                    <p className="text-xl font-semibold">{result ?? "Game over"}</p>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {moves.length} {moves.length === 1 ? "move" : "moves"} ·
                    {opponentName}
                    {clockOn ? ` · ${timeControl.label}` : ""}
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    {savedId ? (
                      <Link
                        href={`/games/${savedId}`}
                        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-medium text-[#0b1602]"
                      >
                        Analyse this game →
                      </Link>
                    ) : moves.length === 0 ? null : saveError ? (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={retrySave}
                          className="rounded-lg border border-[#e0564b] px-3 py-2 text-sm text-[#e0564b]"
                        >
                          Couldn&apos;t save — retry
                        </button>
                        {saveErrorText ? (
                          <p className="text-[10px] leading-relaxed text-[var(--muted)]">
                            {saveErrorText}
                          </p>
                        ) : null}
                        {queued > 0 ? (
                          <p className="text-[10px] text-[var(--muted)]">
                            {queued} game{queued === 1 ? "" : "s"} kept locally —{" "}
                            <button
                              onClick={() => void flushQueue()}
                              className="underline"
                            >
                              try again
                            </button>
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="rounded-lg border border-[var(--line)] px-3 py-2 text-center text-sm text-[var(--muted)]">
                        Saving for analysis…
                      </span>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPhase("setup")}
                        className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                      >
                        Rematch
                      </button>
                      <button
                        onClick={() => setResultDismissed(true)}
                        className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]"
                      >
                        Study the position
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {promotion && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/55">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-xl">
                  <p className="mb-3 text-center text-xs text-[var(--muted)]">
                    Promote to
                  </p>
                  <div className="flex gap-2">
                    {(["q", "r", "b", "n"] as const).map((piece) => (
                      <button
                        key={piece}
                        onClick={() => {
                          const move = promotion;
                          setPromotion(null);
                          if (move) commitMove(move.from, move.to, piece);
                        }}
                        className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-2)] text-[26px] leading-none transition hover:border-[var(--accent)] hover:bg-[var(--panel)]"
                        title={{ q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[piece]}
                      >
                        {youPlay === "w"
                          ? { q: "♕", r: "♖", b: "♗", n: "♘" }[piece]
                          : { q: "♛", r: "♜", b: "♝", n: "♞" }[piece]}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPromotion(null)}
                    className="mt-3 w-full rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--muted)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {clockOn && (
              <div className="w-full max-w-[600px]">
                <ClockCard
                  label={opponentName}
                  avatar={isCharacter ? bot.avatar : undefined}
                  accent={isCharacter ? bot.accent : undefined}
                  sub={
                    isCharacter
                      ? `≈${bot.rating} · ${timeControl.category}`
                      : `Level ${engineLevel.level} · ≈${engineLevel.rating} · ${timeControl.category}`
                  }
                  value={formatClock(theirMs)}
                  active={status === "playing" && !yourTurn}
                  low={theirMs < 20000}
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

            {clockOn && (
              <div className="w-full max-w-[600px]">
                <ClockCard
                  label="You"
                  sub={youPlay === "w" ? "white" : "black"}
                  value={formatClock(yourMs)}
                  active={status === "playing" && yourTurn}
                  low={yourMs < 20000}
                />
              </div>
            )}

            <p className="text-xs text-[var(--muted)]">
              {result
                ? result
                : thinking
                  ? `${opponentName} is thinking…`
                  : yourTurn
                    ? "Your move"
                    : "…"}
            </p>
          </section>

          <aside className="flex flex-col gap-4">
            {isCharacter ? (
              <BotChat bot={bot} messages={chat} onSend={sendChat} />
            ) : null}

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
                {isCharacter ? `${bot.name} · ${bot.style}` : `Stockfish · ${engineLevel.name}`}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {clockOn ? `${timeControl.label} ${timeControl.category}` : "No clock"} ·
                {isCharacter ? `≈${bot.rating} Elo · ${bot.style}` : `level ${engineLevel.level} · skill ${engineLevel.skill}`}
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
                disabled={moves.length === 0 || status === "ended"}
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
                    {Math.ceil(moves.length / 2)}{" "}
                    {Math.ceil(moves.length / 2) === 1 ? "move" : "moves"} · {opponentName}
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
  avatar,
  accent,
}: {
  label: string;
  sub: string;
  value: string;
  active: boolean;
  low: boolean;
  avatar?: string;
  accent?: string;
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
      <div className="flex items-center gap-2">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={label}
            className="h-8 w-8 rounded-full object-cover"
            style={{ boxShadow: `0 0 0 2px ${accent ?? "var(--line)"}` }}
          />
        ) : null}
        <div className="flex flex-col">
          <span className="text-xs font-medium">{label}</span>
          <span className="text-[10px] text-[var(--muted)]">
            {sub}
            {active ? " · to move" : ""}
          </span>
        </div>
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
