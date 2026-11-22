"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import {
  kingInCheckSquare,
  legalTargets,
  moveNumberOf,
  normalizedFen,
  tryMove,
  isPromotion,
  turnOf,
} from "@/lib/chess";
import type { NodeDTO } from "@/lib/types";
import { loadMutedPreference, play, setMuted } from "@/lib/sound";
import {
  addMove,
  deleteSubtree,
  describePosition,
  importPgn,
  saveComment,
  setMainLine,
  type PositionDescription,
} from "@/app/actions";

import ModeTabs from "@/components/ModeTabs";
import PromotionPicker, { type PromotionPiece } from "@/components/PromotionPicker";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";

type Pending = {
  san: string;
  uci: string;
  fen: string;
  from: string;
  to: string;
};

export default function RepertoireBuilder({
  repertoireId,
  name,
  side,
  initialNodes,
  openingIndex,
}: {
  repertoireId: string;
  name: string;
  side: "white" | "black";
  initialNodes: NodeDTO[];
  openingIndex: Record<string, { eco: string; name: string; ply: number }>;
}) {
  // The move tree lives in React state, seeded from the server. Each mutation is
  // applied locally first (optimistic UI) and then persisted by a server action.
  const [nodes, setNodes] = useState<NodeDTO[]>(initialNodes);

  const root = nodes.find((n) => n.ply === 0) ?? initialNodes[0];
  const [currentId, setCurrentId] = useState<string>(root?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">(side);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [description, setDescription] = useState<PositionDescription>({
    opening: null,
    transpositions: [],
  });

  const current = nodes.find((n) => n.id === currentId) ?? root;

  // The mute preference lives in localStorage; read it once on mount.
  useEffect(() => {
    setSoundOn(!loadMutedPreference());
  }, []);

  // Children of the current position = moves you have already stored from here.
  const children = useMemo(
    () =>
      nodes
        .filter((n) => n.parentId === current?.id)
        .sort((a, b) => Number(b.isMain) - Number(a.isMain)),
    [nodes, current?.id],
  );

  // Walk up the parent links to rebuild the line that leads here.
  const path = useMemo(() => {
    const result: NodeDTO[] = [];
    let cursor: NodeDTO | undefined = current;
    while (cursor) {
      result.unshift(cursor);
      // Annotated explicitly: TypeScript can't infer this without looping back
      // on itself (cursor's type depends on the find() that depends on parentId).
      const parentId: string | null = cursor.parentId;
      cursor = parentId ? nodes.find((n) => n.id === parentId) : undefined;
    }
    return result;
  }, [nodes, current]);

  // ---- Auto-detection: one server round trip per navigation -------------
  // The client sends every position key along the current line; the server
  // answers "what opening is this?" and "where else does this position occur?"
  const pathKeys = useMemo(
    () => path.map((node) => normalizedFen(node.fen)),
    [path],
  );
  const pathSignature = pathKeys.join("|");

  useEffect(() => {
    if (pathSignature.length === 0) return;
    let alive = true;

    describePosition({
      normFens: pathSignature.split("|"),
      excludeRepertoireId: repertoireId,
    })
      .then((result) => {
        if (alive) setDescription(result);
      })
      .catch(() => {
        // Detection is a nicety — never break the builder over it.
        if (alive) setDescription({ opening: null, transpositions: [] });
      });

    // Navigating quickly must not let an old response overwrite a newer one.
    return () => {
      alive = false;
    };
  }, [pathSignature, repertoireId]);

  // Instant label: the page preloaded the opening name of every stored
  // position, so walking the tree never waits on the network. The server
  // answer only has to fill in a move added during this session.
  const instantOpening = useMemo(() => {
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const key = normalizedFen(path[index].fen);
      const hit = openingIndex[key];
      if (hit) return hit;
    }
    return null;
  }, [path, openingIndex]);

  const detectedOpening = instantOpening ?? description.opening;
  const transpositions = description.transpositions;  const targets = useMemo(
    () => (selected ? legalTargets(current?.fen ?? "", selected) : []),
    [selected, current?.fen],
  );

  // Layered square overlays: last move → check pulse → selection + legal dots.
  // `backgroundImage` (not `background`) keeps the square colour underneath —
  // `background` would reset it to transparent.
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};

    // 1. Last move: where the piece came from and landed.
    if (current && current.ply > 0 && current.uci.length >= 4) {
      const from = current.uci.slice(0, 2);
      const to = current.uci.slice(2, 4);
      styles[from] = {
        backgroundImage:
          "linear-gradient(rgba(111,191,155,.18), rgba(111,191,155,.18))",
      };
      styles[to] = {
        backgroundImage:
          "linear-gradient(rgba(111,191,155,.34), rgba(111,191,155,.34))",
      };
    }

    // 2. Check: a red radial glow plus a CSS animation defined in globals.css.
    const checkSquare = current ? kingInCheckSquare(current.fen) : null;
    if (checkSquare) {
      styles[checkSquare] = {
        backgroundImage:
          "radial-gradient(circle, rgba(255,72,72,.62) 0%, rgba(255,72,72,.45) 55%, rgba(255,72,72,0) 78%)",
        animation: "check-pulse 1.1s ease-in-out infinite",
      };
    }

    // 3. Selection + legal destination dots sit on top of everything.
    if (selected) {
      styles[selected] = {
        backgroundImage:
          "linear-gradient(rgba(111,191,155,.35), rgba(111,191,155,.35))",
      };
      for (const square of targets) {
        styles[square] = {
          backgroundImage:
            "radial-gradient(circle, rgba(111,191,155,.9) 21%, rgba(111,191,155,0) 23%)",
        };
      }
    }

    return styles;
  }, [selected, targets, current]);

  const mainChild = children.find((c) => c.isMain) ?? children[0];

  // ---- Keyboard navigation -----------------------------------------------
  // ← walks back one move, → walks forward down the main line. This is the
  // single most-used gesture when studying a repertoire, so it is global
  // (window-level) rather than requiring focus on the board.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }

      if (event.key === "ArrowLeft") {
        if (!current?.parentId) return;
        event.preventDefault();
        goTo(current.parentId);
      } else if (event.key === "ArrowRight") {
        if (!mainChild) return;
        event.preventDefault();
        goTo(mainChild.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!current) {
    return (
      <p className="p-8 text-sm text-[var(--muted)]">
        This repertoire has no root position. Recreate it from the dashboard.
      </p>
    );
  }

  /** Navigate somewhere and clear any transient selection state. */
  function goTo(id: string) {
    setCurrentId(id);
    setSelected(null);
    setPending(null);
    setPromo(null);
    setConfirmDelete(false);
  }

  /**
   * The single funnel for every attempted move — both drag and click-to-move.
   * Returns true when the board should keep the move (it already exists in the
   * repertoire), false when the piece should snap back.
   */
  function attempt(from: string, to: string, promotion?: string): boolean {
    // A pawn on the last rank must choose its piece; the board pauses here.
    if (!promotion && isPromotion(current!.fen, from, to)) {
      setPromo({ from, to });
      return false;
    }
    const result = tryMove(current!.fen, from, to, promotion ?? "q");
    if (!result) {
      play("error"); // illegal move — the piece snaps back
      return false;
    }

    const existing = nodes.find(
      (n) => n.parentId === current!.id && n.uci === result.uci,
    );
    if (existing) {
      play("navigate"); // walking into a position you already stored
      goTo(existing.id);
      return true;
    }

    // Legal but not stored yet — offer to add it.
    play(result.check ? "check" : result.captured ? "capture" : "move");
    setSelected(null);
    setPending({ ...result, from, to });
    return false;
  }

  function handleSquareClick({
    square,
    piece,
  }: {
    square: string;
    piece: { pieceType: string } | null;
  }) {
    if (selected && targets.includes(square)) {
      attempt(selected, square);
      return;
    }
    if (!piece) {
      setSelected(null);
      return;
    }
    const colour = piece.pieceType.startsWith("w") ? "w" : "b";
    if (colour !== turnOf(current!.fen)) {
      setSelected(null);
      return;
    }
    setSelected((prev) => (prev === square ? null : square));
  }

  function handlePieceDrop({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean {
    if (!targetSquare) return false;
    return attempt(sourceSquare, targetSquare);
  }

  async function commitPending() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const created = await addMove({
        parentNodeId: current!.id,
        san: pending.san,
        uci: pending.uci,
        fen: pending.fen,
      });
      setNodes((prev) =>
        prev.some((n) => n.id === created.id) ? prev : [...prev, created],
      );
      goTo(created.id);
      play("success");
    } catch {
      play("error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (current!.ply === 0) return;

    // Collect the whole subtree so local state matches the cascade delete.
    const doomed = new Set<string>([current!.id]);
    let frontier = [current!.id];
    while (frontier.length > 0) {
      const next = nodes
        .filter((n) => n.parentId && frontier.includes(n.parentId))
        .map((n) => n.id);
      next.forEach((id) => doomed.add(id));
      frontier = next;
    }

    await deleteSubtree(current!.id);
    setNodes((prev) => prev.filter((n) => !doomed.has(n.id)));
    goTo(current!.parentId ?? root!.id);
    play("delete");
  }

  async function handleSetMain(nodeId: string) {
    setNodes((prev) =>
      prev.map((n) =>
        n.parentId === current!.id ? { ...n, isMain: n.id === nodeId } : n,
      ),
    );
    await setMainLine(nodeId);
  }

  async function handleSaveComment(nodeId: string, text: string) {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, comment: text || null } : n)),
    );
    await saveComment(nodeId, text);
  }

  /** PGN import returns the nodes it actually created — just append them. */
  function handleImported(created: NodeDTO[]) {
    if (created.length === 0) return;
    setNodes((prev) => [...prev, ...created]);
    play("success");
  }

  function jumpToMainlineEnd(startId: string) {
    let id = startId;
    for (let guard = 0; guard < 500; guard += 1) {
      const kids = nodes.filter((n) => n.parentId === id);
      const main = kids.find((k) => k.isMain) ?? kids[0];
      if (!main) break;
      id = main.id;
    }
    goTo(id);
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-4">
          <Link
            href="/"
            className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold tracking-tight">{name}</h1>
          <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">
            {side} repertoire
          </span>
          {detectedOpening && (
            <span
              key={`${detectedOpening.eco}-${detectedOpening.name}`}
              className="animate-pop flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-0.5 text-[11px]"
            >
              <span className="font-mono font-semibold text-[var(--accent)]">
                {detectedOpening.eco}
              </span>
              <span className="max-w-[240px] truncate">
                {detectedOpening.name}
              </span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ModeTabs repertoireId={repertoireId} active="build" />
            <button
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setMuted(!next);
                if (next) play("navigate");
              }}
              className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
              title={soundOn ? "Mute sound effects" : "Unmute sound effects"}
            >
              {soundOn ? "♪ On" : "♪ Off"}
            </button>
            <button
              onClick={() =>
                setOrientation((prev) => (prev === "white" ? "black" : "white"))
              }
              className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs transition hover:border-[var(--accent)]"
            >
              Flip board
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------- Board column ---------- */}
        <section className="flex flex-col items-center gap-4">
          <div className="board-glow relative w-full max-w-[540px] overflow-hidden rounded-xl border border-[var(--line)] shadow-2xl shadow-black/40">
            {promo && (
              <PromotionPicker
                side={(current!.fen.split(" ")[1] === "b" ? "black" : "white")}
                onPick={(piece: PromotionPiece) => {
                  const target = promo;
                  setPromo(null);
                  if (target) attempt(target.from, target.to, piece);
                }}
                onCancel={() => setPromo(null)}
              />
            )}
            <Chessboard
              options={{
                id: "repertoire-board",
                position: current.fen,
                boardOrientation: orientation,
                onPieceDrop: handlePieceDrop,
                onSquareClick: handleSquareClick,
                squareStyles,
                allowDrawingArrows: true,
                animationDurationInMs: 160,
                darkSquareStyle: DARK_SQUARE,
                lightSquareStyle: LIGHT_SQUARE,
              }}
            />
          </div>

          <div className="flex w-full max-w-[540px] items-center gap-2">
            <button
              onClick={() => goTo(root!.id)}
              disabled={current.ply === 0}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm transition enabled:hover:border-[var(--accent)] disabled:opacity-35"
              title="Back to the starting position"
            >
              ⟵
            </button>
            <button
              onClick={() => current.parentId && goTo(current.parentId)}
              disabled={!current.parentId}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm transition enabled:hover:border-[var(--accent)] disabled:opacity-35"
              title="Previous move"
            >
              ←
            </button>
            <button
              onClick={() => mainChild && goTo(mainChild.id)}
              disabled={!mainChild}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm transition enabled:hover:border-[var(--accent)] disabled:opacity-35"
              title="Next main-line move"
            >
              →
            </button>
            <button
              onClick={() => jumpToMainlineEnd(current.id)}
              disabled={!mainChild}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm transition enabled:hover:border-[var(--accent)] disabled:opacity-35"
              title="Jump to the end of the main line"
            >
              ⟶
            </button>
            <span className="ml-auto font-mono text-xs text-[var(--muted)]">
              {current.ply === 0 ? "start" : `${moveNumberOf(current.ply)} ${current.san}`}
            </span>
          </div>

          {pending && (
            <div className="animate-rise flex w-full max-w-[540px] items-center gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 shadow-lg shadow-[var(--accent)]/10">
              <span className="text-sm">
                <span className="font-mono font-semibold">{pending.san}</span> is
                not in this repertoire yet.
              </span>
              <button
                onClick={commitPending}
                disabled={busy}
                className="ml-auto rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add this move"}
              </button>
              <button
                onClick={() => setPending(null)}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)]"
              >
                Dismiss
              </button>
            </div>
          )}
        </section>

        {/* ---------- Side panel ---------- */}
        <aside className="flex flex-col gap-4">
          <Panel title="Detected opening">
            {detectedOpening ? (
              <div
                key={`${detectedOpening.eco}-${detectedOpening.name}`}
                className="animate-pop flex items-start gap-2.5"
              >
                <span className="mt-0.5 rounded-md bg-[var(--accent)]/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent)]">
                  {detectedOpening.eco}
                </span>
                <span className="text-sm leading-snug">
                  {detectedOpening.name}
                </span>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                {current.ply === 0
                  ? "Starting position — play a move to identify the opening."
                  : "No recognised opening for this move order."}
              </p>
            )}
          </Panel>

          {transpositions.length > 0 && (
            <Panel title="Transposition detected">
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--muted)]">
                  This exact position also occurs in:
                </p>
                {transpositions.map((hit) => (
                  <Link
                    key={hit.repertoireId}
                    href={`/r/${hit.repertoireId}`}
                    className="animate-rise rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/[.06] px-3 py-2 transition hover:border-[var(--accent)]"
                  >
                    <span className="block text-sm font-medium">
                      {hit.repertoireName}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--muted)]">
                      {hit.sanPath.join(" ")}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Line">
            {path.filter((n) => n.ply > 0).length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                No moves yet. Make a move on the board, then add it.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2 font-mono text-sm">
                {path
                  .filter((n) => n.ply > 0)
                  .map((n) => (
                    <button
                      key={n.id}
                      onClick={() => goTo(n.id)}
                      className={`rounded px-1 py-0.5 transition hover:bg-white/10 ${
                        n.id === current.id
                          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                          : ""
                      }`}
                    >
                      {n.ply % 2 === 1 && (
                        <span className="mr-1 text-[var(--muted)]">
                          {(n.ply + 1) / 2}.
                        </span>
                      )}
                      {n.san}
                    </button>
                  ))}
              </div>
            )}
          </Panel>

          <Panel title={`Moves from here (${children.length})`}>
            {children.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                This is where your line ends. Play a move to extend it.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {children.map((child) => (
                  <div key={child.id} className="flex items-center gap-1.5">
                    <button
                      onClick={() => goTo(child.id)}
                      className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-left font-mono text-sm transition hover:border-[var(--accent)]"
                    >
                      {child.san}
                      {child.isMain && (
                        <span className="ml-2 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-wider text-[var(--accent)]">
                          main
                        </span>
                      )}
                    </button>
                    {!child.isMain && (
                      <button
                        onClick={() => handleSetMain(child.id)}
                        className="rounded-lg border border-[var(--line)] px-2 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        title="Make this the main line"
                      >
                        ★
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Note on this position">
            <CommentBox
              key={current.id}
              nodeId={current.id}
              initial={current.comment ?? ""}
              onSave={handleSaveComment}
            />
          </Panel>

          <Panel title="Import PGN">
            <ImportPanel
              repertoireId={repertoireId}
              onImported={handleImported}
            />
          </Panel>

          <Panel title="Danger zone">
            {current.ply === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                You are at the starting position — nothing to delete here.
              </p>
            ) : confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--muted)]">
                  Delete <span className="font-mono">{current.san}</span> and every
                  move after it?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Delete branch
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-500/10"
              >
                Delete this move and everything after it
              </button>
            )}
          </Panel>
        </aside>
      </main>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </div>
  );
}

function CommentBox({
  nodeId,
  initial,
  onSave,
}: {
  nodeId: string;
  initial: string;
  onSave: (nodeId: string, text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="Why did you play this? What's the plan?"
        className="w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
      />
      <button
        onClick={() => onSave(nodeId, value)}
        disabled={!dirty}
        className="self-end rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {dirty ? "Save note" : "Saved"}
      </button>
    </div>
  );
}

function ImportPanel({
  repertoireId,
  onImported,
}: {
  repertoireId: string;
  onImported: (created: NodeDTO[]) => void;
}) {
  const [pgn, setPgn] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runImport() {
    if (pgn.trim().length === 0 || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await importPgn({ repertoireId, pgn });
      onImported(result.createdNodes);

      const parts = [
        `${result.gamesImported} game${result.gamesImported === 1 ? "" : "s"} read`,
        `${result.movesWalked} moves checked`,
        `${result.createdNodes.length} new position${
          result.createdNodes.length === 1 ? "" : "s"
        } added`,
      ];
      if (result.gamesFailed > 0) parts.push(`${result.gamesFailed} unreadable`);
      setStatus(parts.join(" · "));

      if (result.createdNodes.length > 0) setPgn("");
    } catch (error) {
      play("error");
      setStatus(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={pgn}
        onChange={(event) => setPgn(event.target.value)}
        rows={4}
        placeholder={'[Event "Italian Game"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4'}
        className="w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs outline-none transition focus:border-[var(--accent)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runImport}
          disabled={busy || pgn.trim().length === 0}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Importing…" : "Import"}
        </button>
        {status && (
          <span className="text-xs text-[var(--muted)]">{status}</span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        Paste one or more PGN games. Moves already in your tree are matched
        rather than duplicated, so importing the same game twice adds nothing.
      </p>
    </div>
  );
}
