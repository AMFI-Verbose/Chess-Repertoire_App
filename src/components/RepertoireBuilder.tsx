"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { legalTargets, moveNumberOf, tryMove, turnOf } from "@/lib/chess";
import type { NodeDTO } from "@/lib/types";
import { addMove, deleteSubtree, saveComment, setMainLine } from "@/app/actions";

type Pending = {
  san: string;
  uci: string;
  fen: string;
  from: string;
  to: string;
};

export default function RepertoireBuilder({
  name,
  side,
  initialNodes,
}: {
  name: string;
  side: "white" | "black";
  initialNodes: NodeDTO[];
}) {
  // The move tree lives in React state, seeded from the server. Each mutation is
  // applied locally first (optimistic UI) and then persisted by a server action.
  const [nodes, setNodes] = useState<NodeDTO[]>(initialNodes);

  const root = nodes.find((n) => n.ply === 0) ?? initialNodes[0];
  const [currentId, setCurrentId] = useState<string>(root?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">(side);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = nodes.find((n) => n.id === currentId) ?? root;

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

  const targets = useMemo(
    () => (selected ? legalTargets(current?.fen ?? "", selected) : []),
    [selected, current?.fen],
  );

  // Dot overlays. `backgroundImage` (not `background`) keeps the square colour
  // underneath — `background` would reset it to transparent.
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (!selected) return styles;
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
    return styles;
  }, [selected, targets]);

  const mainChild = children.find((c) => c.isMain) ?? children[0];

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
    setConfirmDelete(false);
  }

  /**
   * The single funnel for every attempted move — both drag and click-to-move.
   * Returns true when the board should keep the move (it already exists in the
   * repertoire), false when the piece should snap back.
   */
  function attempt(from: string, to: string): boolean {
    const result = tryMove(current!.fen, from, to);
    if (!result) return false;

    const existing = nodes.find(
      (n) => n.parentId === current!.id && n.uci === result.uci,
    );
    if (existing) {
      goTo(existing.id);
      return true;
    }

    // Legal but not stored yet — offer to add it.
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
          <div className="ml-auto flex items-center gap-2">
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
          <div className="w-full max-w-[540px] overflow-hidden rounded-xl border border-[var(--line)] shadow-2xl shadow-black/40">
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
                darkSquareStyle: { backgroundColor: "#4a5766" },
                lightSquareStyle: { backgroundColor: "#c9d4e0" },
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
            <div className="flex w-full max-w-[540px] items-center gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3">
              <span className="text-sm">
                <span className="font-mono font-semibold">{pending.san}</span> is
                not in this repertoire yet.
              </span>
              <button
                onClick={commitPending}
                disabled={busy}
                className="ml-auto rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0b0e14] transition hover:brightness-110 disabled:opacity-50"
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
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10"
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
        className="self-end rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b0e14] transition hover:brightness-110 disabled:opacity-40"
      >
        {dirty ? "Save note" : "Saved"}
      </button>
    </div>
  );
}
