"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import PromotionPicker, { type PromotionPiece } from "@/components/PromotionPicker";
import {
  acceptDuelAction,
  cancelDuelAction,
  moveDuelAction,
  resignDuelAction,
} from "@/app/duel/actions";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";
import { formatClock, timeControlById } from "@/lib/gameOptions";
import type { DuelState } from "@/lib/duel-types";

function colorOf(state: DuelState, handle: string) {
  if (state.guestHandle === handle) {
    return state.hostColor === "white" ? "black" : "white";
  }
  return state.hostColor;
}

function clockLabel(tc: string) {
  if (tc === "correspondence" || tc === "unlimited") return "No clock";
  return timeControlById(tc).label;
}

function PlayerRow({
  name,
  suffix,
  ms,
  clocked,
  active,
  low,
}: {
  name: string;
  suffix: string;
  ms: number;
  clocked: boolean;
  active: boolean;
  low: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            active ? "bg-[var(--accent)]" : "bg-transparent ring-1 ring-[var(--line)]"
          }`}
        />
        <span className="truncate text-[13px] font-medium">{name}</span>
        <span className="shrink-0 text-[10.5px] text-[var(--muted)]">{suffix}</span>
      </div>
      {clocked && (
        <span
          className={`rounded-sm px-2 py-0.5 font-mono text-[13px] tabular-nums ${
            low ? "bg-red-600 text-white" : active ? "bg-[var(--panel-2)]" : "text-[var(--muted)]"
          }`}
        >
          {formatClock(ms)}
        </span>
      )}
    </div>
  );
}

export default function DuelRoom({
  initial,
  viewerHandle,
  viewerVerified,
}: {
  initial: DuelState;
  viewerHandle: string | null;
  viewerVerified: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [localFen, setLocalFen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);
  busyRef.current = busy;

  const viewerColor = viewerHandle ? colorOf(state, viewerHandle) : null;
  const isHost = viewerHandle === state.hostHandle;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const response = await fetch(`/api/duel/${state.code}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { state: DuelState };
      setState(data.state);
      setLocalFen(null);
    } catch {
      // A dropped poll is fine — the next one catches up.
    }
  }, [state.code]);

  useEffect(() => {
    if (state.status !== "playing" && !(state.status === "open" && isHost)) return;
    const timer = setInterval(() => void refresh(), 2600);
    return () => clearInterval(timer);
  }, [state.status, refresh, isHost]);

  const board = useMemo(() => new Chess(localFen ?? state.fen), [localFen, state.fen]);
  const moves = useMemo(() => {
    const game = new Chess();
    if (!state.pgn) return [];
    try {
      game.loadPgn(state.pgn);
    } catch {
      return [];
    }
    return game.history({ verbose: true });
  }, [state.pgn]);

  const yourTurn =
    state.status === "playing" &&
    viewerColor !== null &&
    board.turn() === (viewerColor === "white" ? "w" : "b");

  const whiteName = `${state.hostColor === "white" ? state.hostHandle : state.guestHandle ?? "Waiting…"}`;
  const blackName = `${state.hostColor === "black" ? state.hostHandle : state.guestHandle ?? "Waiting…"}`;

  function clockFor(color: "white" | "black") {
    const base = color === "white" ? state.whiteMs : state.blackMs;
    if (!state.clocked || state.status !== "playing" || !state.lastMoveAt) return base;
    const turnColor = state.turn === "w" ? "white" : "black";
    if (turnColor !== color) return base;
    return Math.max(0, base - (now - new Date(state.lastMoveAt).getTime()));
  }

  async function sendMove(from: string, to: string, promotionPiece?: PromotionPiece) {
    const probe = new Chess(localFen ?? state.fen);
    try {
      probe.move({ from, to, promotion: promotionPiece ?? "q" });
    } catch {
      return;
    }
    setBusy(true);
    setSelected(null);
    setLocalFen(probe.fen());
    setError(null);
    try {
      const result = await moveDuelAction({ code: state.code, from, to, promotion: promotionPiece });
      if (!result.ok) {
        setError(result.error);
        setLocalFen(null);
        return;
      }
      setState(result.state);
      setLocalFen(null);
    } finally {
      setBusy(false);
    }
  }

  function onSquareClick({ square }: { square: string }) {
    if (!yourTurn || promotion) return;
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (selected) {
      const piece = board.get(selected as never);
      if (piece?.type === "p" && (square[1] === "8" || square[1] === "1")) {
        const legal = board.moves({ square: selected as never, verbose: true });
        if (legal.some((move) => move.to === square)) {
          setPromotion({ from: selected, to: square });
          setSelected(null);
          return;
        }
      }
      void sendMove(selected, square);
      return;
    }
    const piece = board.get(square as never);
    if (piece && piece.color === board.turn()) setSelected(square);
  }

  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    setSelected(null);
    if (!targetSquare || !yourTurn) return false;
    const piece = board.get(sourceSquare as never);
    if (piece?.type === "p" && (targetSquare[1] === "8" || targetSquare[1] === "1")) {
      const legal = board.moves({ square: sourceSquare as never, verbose: true });
      if (legal.some((move) => move.to === targetSquare)) {
        setPromotion({ from: sourceSquare, to: targetSquare });
        return false;
      }
    }
    void sendMove(sourceSquare, targetSquare);
    return true;
  }

  const squareStyles = useMemo(() => {
    const styles: Record<string, { background?: string }> = {};
    if (selected) {
      styles[selected] = { background: "rgba(98,153,36,0.55)" };
      for (const move of board.moves({ square: selected as never, verbose: true })) {
        styles[move.to] = { background: "rgba(98,153,36,0.28)" };
      }
    }
    const last = moves[moves.length - 1];
    if (last) {
      styles[last.from] = { background: "rgba(155,199,0,0.35)" };
      styles[last.to] = { background: "rgba(155,199,0,0.45)" };
    }
    return styles;
  }, [selected, board, moves]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const result = await acceptDuelAction(state.code);
      if (!result.ok) setError(result.error);
      else {
        setState(result.state);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function resign() {
    setBusy(true);
    try {
      const result = await resignDuelAction(state.code);
      if (result.ok) setState(result.state);
      else setError(result.error);
    } finally {
      setBusy(false);
      setConfirmResign(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const result = await cancelDuelAction(state.code);
      if (result.ok) setState(result.state);
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/duel/${state.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Could not copy — select the link and copy it manually.");
    }
  }

  if (!viewerHandle) {
    return (
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="text-sm">
          <span className="font-medium">@{state.hostHandle}</span> challenged a friend to{" "}
          {clockLabel(state.timeControl)} chess.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Sign in to accept the game and take your side of the board.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-sm bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          Sign in to play
        </Link>
      </div>
    );
  }

  if (state.status === "open" && isHost) {
    return (
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
          Waiting for an opponent
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          {clockLabel(state.timeControl)} · you are {state.hostColor}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Send this link to a friend, or leave it open — it also appears in the
          lobby if it is public.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-sm border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-2 text-[11px]">
            {typeof window === "undefined" ? `/duel/${state.code}` : `${window.location.origin}/duel/${state.code}`}
          </code>
          <button
            onClick={copyLink}
            className="rounded-sm border border-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent)]"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={cancel}
            disabled={busy}
            className="rounded-sm border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] disabled:opacity-50"
          >
            Cancel challenge
          </button>
          <Link href="/play" className="rounded-sm px-3 py-1.5 text-xs text-[var(--muted)] underline">
            Back to play
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "open" && !isHost) {
    return (
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Challenge</p>
        <h2 className="mt-2 text-xl font-semibold">
          @{state.hostHandle} · {clockLabel(state.timeControl)}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          You will play {state.hostColor === "white" ? "black" : "white"}.
          {state.guestHandle ? "" : " Accepting starts the clock."}
        </p>
        {!viewerVerified && (
          <p className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            Confirm your email first — publishing and games need a verified address.
          </p>
        )}
        {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
        <button
          onClick={accept}
          disabled={busy || !viewerVerified}
          className="mt-4 rounded-sm bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Starting…" : "Accept challenge"}
        </button>
      </div>
    );
  }

  if (state.status === "cancelled") {
    return (
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-6 text-sm">
        This challenge was cancelled.
        <Link href="/play" className="mt-4 block text-xs text-[var(--accent)] underline">
          Back to play
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="flex flex-col gap-2">
        <PlayerRow
          name={viewerColor === "black" ? blackName : whiteName}
          suffix="black"
          ms={clockFor("black")}
          clocked={state.clocked}
          active={state.status === "playing" && state.turn === "b"}
          low={clockFor("black") < 20000}
        />
        <div className={`relative overflow-hidden rounded-md border border-[var(--line)] ${yourTurn ? "ring-1 ring-[var(--accent)]" : ""}`}>
          {promotion && (
            <PromotionPicker
              compact
              side={viewerColor === "black" ? "black" : "white"}
              onPick={(piece) => {
                const target = promotion;
                setPromotion(null);
                void sendMove(target.from, target.to, piece);
              }}
              onCancel={() => setPromotion(null)}
            />
          )}
          <Chessboard
            options={{
              id: "duel-board",
              position: localFen ?? state.fen,
              boardOrientation: viewerColor === "black" ? "black" : "white",
              onPieceDrop: onDrop,
              onSquareClick,
              onPieceDrag: ({ square }) => {
                if (!square || !yourTurn) return;
                const piece = board.get(square as never);
                if (piece && piece.color === board.turn()) setSelected(square);
              },
              onPieceDragCancel: () => setSelected(null),
              squareStyles,
              animationDurationInMs: 220,
              lightSquareStyle: LIGHT_SQUARE,
              darkSquareStyle: DARK_SQUARE,
            }}
          />
        </div>
        <PlayerRow
          name={viewerColor === "black" ? whiteName : blackName}
          suffix="white"
          ms={clockFor("white")}
          clocked={state.clocked}
          active={state.status === "playing" && state.turn === "w"}
          low={clockFor("white") < 20000}
        />
        {state.status === "playing" && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--muted)]">
              {yourTurn ? "Your move" : "Waiting for your opponent"}
              {state.clocked ? "" : " · correspondence, no clock"}
            </p>
            {confirmResign ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--muted)]">Resign?</span>
                <button
                  onClick={() => void resign()}
                  disabled={busy}
                  className="rounded-sm bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmResign(false)}
                  className="rounded-sm border border-[var(--line)] px-2.5 py-1 text-[11px]"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmResign(true)}
                className="text-[11px] text-[var(--muted)] underline decoration-dotted"
              >
                Resign
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        {state.status === "finished" && (
          <div className="mt-2 rounded-sm border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3">
            <p className="text-sm font-semibold">{state.resultText || "Game over"}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <Link href="/play" className="text-[var(--accent)] underline">
                Play again
              </Link>
              <button onClick={() => void copyLink()} className="text-[var(--muted)] underline">
                Copy game link
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">Time control</p>
          <p className="mt-1 text-sm font-medium">{clockLabel(state.timeControl)}</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {state.visibility === "private" ? "Private link" : "Public lobby game"}
          </p>
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <p className="text-[11px] text-[var(--muted)]">
              {viewerColor ? `You are ${viewerColor}` : "Spectating"}
            </p>
            <p className="text-[11px] text-[var(--muted)]">Code {state.code}</p>
          </div>
        </div>

        <div className="rounded-md border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] px-3 py-2 text-[12px] font-semibold">Moves</h2>
          {moves.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-[var(--muted)]">No moves yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto px-3 py-2 font-mono text-[11px]">
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {moves.map((move, index) => (
                  <span key={index} className="whitespace-nowrap">
                    {index % 2 === 0 && (
                      <span className="mr-1 text-[var(--muted)]">{index / 2 + 1}.</span>
                    )}
                    {move.san}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
