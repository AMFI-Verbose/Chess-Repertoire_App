"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import PlayVsEngine from "@/components/PlayVsEngine";
import { acceptDuelAction, createDuelAction } from "@/app/duel/actions";
import { timeControlById } from "@/lib/gameOptions";
import type { DuelState } from "@/lib/duel-types";

type Tab = "quick" | "lobby" | "correspondence";

const DUEL_TIMES = ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5", "15+10", "30+0", "30+20"];

function tcLabel(state: DuelState) {
  if (state.timeControl === "correspondence") return "Correspondence";
  return timeControlById(state.timeControl).label;
}

function when(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

export default function PlayHub({
  openDuels,
  myDuels,
  recentDuels,
  viewerHandle,
  verified,
  members,
  gamesPlayed,
  playingCount,
}: {
  openDuels: DuelState[];
  myDuels: DuelState[];
  recentDuels: DuelState[];
  viewerHandle: string | null;
  verified: boolean;
  members: number;
  gamesPlayed: number;
  playingCount: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("quick");
  const [timeControl, setTimeControl] = useState("5+3");
  const [color, setColor] = useState<"white" | "black" | "random">("random");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveCount = playingCount;

  async function create(visibility: "public" | "private", tc = timeControl) {
    if (!viewerHandle) {
      router.push("/login");
      return;
    }
    if (!verified) {
      setError("Confirm your email before creating games.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createDuelAction({ timeControl: tc, color, visibility });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/duel/${result.code}`);
    } finally {
      setBusy(false);
    }
  }

  async function accept(code: string) {
    if (!viewerHandle) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await acceptDuelAction(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/duel/${code}`);
    } finally {
      setBusy(false);
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "quick", label: "Quick pairing" },
    { id: "lobby", label: "Lobby" },
    { id: "correspondence", label: "Correspondence" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
            ← Home
          </Link>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Play</h1>
          <p className="text-[12px] text-[var(--muted)]">
            A quick game against the computer, a real opponent from the lobby, or a
            correspondence game that waits for you.
          </p>
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          {members} player{members === 1 ? "" : "s"} · {liveCount} game{liveCount === 1 ? "" : "s"} in play
        </p>
      </header>

      <div className="mt-4 flex items-center gap-1 overflow-x-auto border-b border-[var(--line)]">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              setTab(entry.id);
              setError(null);
            }}
            aria-pressed={tab === entry.id}
            className={`shrink-0 border-b-2 px-3 py-2 text-[12px] transition ${
              tab === entry.id
                ? "border-[var(--accent)] font-medium text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {entry.label}
          </button>
        ))}
        {liveCount > 0 && (
          <span className="ml-2 shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-white">
            {liveCount} game{liveCount === 1 ? "" : "s"} in play
          </span>
        )}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[210px_minmax(0,1fr)_250px]">
        <aside className="order-3 flex flex-col gap-3 lg:order-none">
          <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
              <h2 className="text-[12px] font-semibold">Your games</h2>
              <Link href="/games" className="text-[10px] text-[var(--muted)] underline">
                History
              </Link>
            </div>
            {myDuels.length === 0 ? (
              <p className="px-3 py-3 text-[11px] leading-relaxed text-[var(--muted)]">
                No challenges yet. Create a lobby game or send a friend a link.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {myDuels.slice(0, 5).map((duel) => (
                  <li key={duel.code}>
                    <Link
                      href={`/duel/${duel.code}`}
                      className="block px-3 py-2 transition hover:bg-[var(--panel-2)]"
                    >
                      <p className="truncate text-[11.5px]">
                        {duel.guestHandle ?? "Waiting…"}
                        {duel.status === "playing" ? " · live" : " · open"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        {tcLabel(duel)} · {when(duel.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
              <h2 className="text-[12px] font-semibold">Recent results</h2>
              <Link href="/games" className="text-[10px] text-[var(--muted)] underline">
                More »
              </Link>
            </div>
            {recentDuels.length === 0 ? (
              <p className="px-3 py-3 text-[11px] leading-relaxed text-[var(--muted)]">
                Finished lobby games show up here, win or lose.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {recentDuels.map((duel) => {
                  const you = duel.hostColor === "white" ? "white" : "black";
                  const youWon =
                    duel.winner === "draw" ? null : duel.winner === you;
                  return (
                    <li key={duel.code}>
                      <Link
                        href={`/duel/${duel.code}`}
                        className="flex items-start gap-2 px-3 py-2 transition hover:bg-[var(--panel-2)]"
                      >
                        <span
                          className="mt-0.5 text-[11px]"
                          style={{ color: youWon === null ? "var(--muted)" : youWon ? "var(--accent)" : "#b3261e" }}
                        >
                          {youWon === null ? "½" : youWon ? "✓" : "✗"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px]">
                            {youWon === null ? "Draw" : youWon ? "Victory" : "Defeat"} vs{" "}
                            {duel.hostHandle === viewerHandle
                              ? duel.guestHandle ?? "guest"
                              : duel.hostHandle}
                          </span>
                          <span className="block text-[10px] text-[var(--muted)]">
                            {tcLabel(duel)} · {when(duel.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>

        <section className="order-1 min-w-0 lg:order-none">
          {tab === "quick" && (
            <div
              id="engine-setup"
              className="scroll-mt-20 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5"
            >
              <PlayVsEngine embedded />
            </div>
          )}

          {tab === "lobby" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
                <h2 className="text-[13px] font-semibold">Create a lobby game</h2>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  A public challenge: anyone signed in can accept it.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={timeControl}
                    onChange={(event) => setTimeControl(event.target.value)}
                    className="rounded-sm border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 text-[11px]"
                  >
                    {DUEL_TIMES.map((id) => (
                      <option key={id} value={id}>
                        {timeControlById(id).label} · {timeControlById(id).category}
                      </option>
                    ))}
                    <option value="correspondence">Correspondence · no clock</option>
                  </select>
                  <select
                    value={color}
                    onChange={(event) => setColor(event.target.value as typeof color)}
                    className="rounded-sm border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 text-[11px]"
                  >
                    <option value="random">Random colour</option>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                  </select>
                  <button
                    onClick={() => void create("public")}
                    disabled={busy}
                    className="rounded-sm bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Creating…" : "Create challenge"}
                  </button>
                </div>
                {error && <p className="mt-2 text-[11px] text-red-700">{error}</p>}
                {!viewerHandle && (
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    <Link href="/login" className="text-[var(--accent)] underline">Sign in</Link>{" "}
                    to create or accept a game.
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
                <div className="flex items-baseline justify-between border-b border-[var(--line)] px-4 py-2.5">
                  <h2 className="text-[13px] font-semibold">Open challenges</h2>
                  <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">
                    {openDuels.length} waiting
                  </span>
                </div>
                {openDuels.length === 0 ? (
                  <p className="px-4 py-5 text-[12px] leading-relaxed text-[var(--muted)]">
                    Nobody is waiting right now. Create one — it shows up here for
                    everyone else.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--line)]">
                    {openDuels.map((duel) => (
                      <li key={duel.code} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium">
                            @{duel.hostHandle}
                          </p>
                          <p className="text-[10.5px] text-[var(--muted)]">
                            {tcLabel(duel)} · plays {duel.hostColor === "white" ? "black" : "white"} ·
                            hosted {when(duel.createdAt)}
                          </p>
                        </div>
                        {duel.hostHandle === viewerHandle ? (
                          <Link
                            href={`/duel/${duel.code}`}
                            className="shrink-0 rounded-sm border border-[var(--line)] px-2.5 py-1 text-[10.5px] text-[var(--muted)]"
                          >
                            Your link
                          </Link>
                        ) : (
                          <button
                            onClick={() => void accept(duel.code)}
                            disabled={busy || !viewerHandle}
                            className="shrink-0 rounded-sm bg-[var(--accent)] px-2.5 py-1 text-[10.5px] font-semibold text-white disabled:opacity-50"
                          >
                            Accept
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === "correspondence" && (
            <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
                <div>
                  <h2 className="text-[13px] font-semibold">Correspondence games</h2>
                  <p className="text-[10.5px] text-[var(--muted)]">
                    No clock. Move when you have time; the position waits.
                  </p>
                </div>
                <button
                  onClick={() => void create("private", "correspondence")}
                  disabled={busy}
                  className="rounded-sm border border-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] disabled:opacity-50"
                >
                  New correspondence game
                </button>
              </div>
              {myDuels.filter((duel) => duel.timeControl === "correspondence").length === 0 ? (
                <p className="px-4 py-6 text-[12px] leading-relaxed text-[var(--muted)]">
                  Start one and send the link. It stays open until your friend moves.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {myDuels
                    .filter((duel) => duel.timeControl === "correspondence")
                    .map((duel) => (
                      <li key={duel.code}>
                        <Link
                          href={`/duel/${duel.code}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--panel-2)]"
                        >
                          <span className="text-[12px]">
                            @{duel.hostHandle} vs {duel.guestHandle ? `@${duel.guestHandle}` : "open"}
                          </span>
                          <span className="text-[10.5px] text-[var(--muted)]">
                            {duel.status === "playing"
                              ? duel.turn === "w"
                                ? "White to move"
                                : "Black to move"
                              : "Waiting"}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
              {error && <p className="px-4 pb-3 text-[11px] text-red-700">{error}</p>}
            </div>
          )}
        </section>

        <aside className="order-2 flex flex-col gap-2 lg:order-none">
          <button
            onClick={() => {
              setTab("lobby");
              setError(null);
            }}
            className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-left transition hover:border-[var(--accent)]"
          >
            <span className="text-lg">⚑</span>
            <span>
              <span className="block text-[12px] font-medium">Create lobby game</span>
              <span className="block text-[10px] text-[var(--muted)]">Public challenge</span>
            </span>
          </button>

          <button
            onClick={() => void create("private")}
            disabled={busy}
            className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-left transition hover:border-[var(--accent)] disabled:opacity-50"
          >
            <span className="text-lg">♟</span>
            <span>
              <span className="block text-[12px] font-medium">Challenge a friend</span>
              <span className="block text-[10px] text-[var(--muted)]">Private link</span>
            </span>
          </button>

          <button
            onClick={() => {
              setTab("quick");
              setError(null);
              // The panel is already mounted on the quick tab; on the other
              // tabs let the render land first, then bring it into view.
              window.setTimeout(() => {
                document.getElementById("engine-setup")?.scrollIntoView({ block: "start" });
              }, 60);
            }}
            className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-left transition hover:border-[var(--accent)]"
          >
            <span className="text-lg">⚙</span>
            <span>
              <span className="block text-[12px] font-medium">Play against computer</span>
              <span className="block text-[10px] text-[var(--muted)]">Stockfish or a character</span>
            </span>
          </button>

          {error && <p className="text-[11px] text-red-700">{error}</p>}
        </aside>
      </div>

      <footer className="mt-6 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--muted)]">
        {members} player{members === 1 ? "" : "s"} · {gamesPlayed} games played here · clocks are
        server-side, so a reload never loses time
      </footer>
    </main>
  );
}
