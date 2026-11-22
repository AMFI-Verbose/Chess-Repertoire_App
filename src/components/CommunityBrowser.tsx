"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { StudySummary } from "@/app/actions";
import MiniBoard from "@/components/MiniBoard";

type Sort = "newest" | "discussed" | "title";
type Source = "all" | "lichess" | "local";

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "discussed", label: "Most discussed" },
  { id: "title", label: "Title A–Z" },
];

const SOURCES: { id: Source; label: string }[] = [
  { id: "all", label: "All games" },
  { id: "lichess", label: "Lichess" },
  { id: "local", label: "Players" },
];

function formatResult(result: string) {
  if (result === "1/2-1/2") return "½–½";
  return result || "—";
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${date.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  })}`;
}

/**
 * The community index, laid out like a Lichess game list: one toolbar, source
 * tabs, and dense rows with a final-position thumbnail. Search and sorting run
 * on the already-loaded list, so typing never waits on the database.
 */
export default function CommunityBrowser({ studies }: { studies: StudySummary[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [author, setAuthor] = useState("");
  const [source, setSource] = useState<Source>("all");

  const authors = useMemo(() => {
    const seen = new Set<string>();
    for (const study of studies) if (study.author) seen.add(study.author);
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [studies]);

  const counts = useMemo(
    () => ({
      all: studies.length,
      lichess: studies.filter((study) => study.source === "lichess").length,
      local: studies.filter((study) => study.source !== "lichess").length,
    }),
    [studies],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = studies.filter((study) => {
      if (source === "lichess" && study.source !== "lichess") return false;
      if (source === "local" && study.source === "lichess") return false;
      if (author && study.author !== author) return false;
      if (!needle) return true;
      return [study.title, study.subtitle, study.author, study.eco]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return rows.sort((a, b) => {
      if (sort === "discussed")
        return b.commentCount - a.commentCount || a.title.localeCompare(b.title);
      if (sort === "title") return a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [studies, query, sort, author, source]);

  const filtering = Boolean(query.trim() || author || source !== "all");

  function clear() {
    setQuery("");
    setAuthor("");
    setSource("all");
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <label className="relative w-full sm:w-auto sm:flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search games, openings, players…"
            aria-label="Search studies"
            className="w-full rounded-sm border border-[var(--line)] bg-[var(--panel-2)] py-1.5 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-white"
          />
        </label>

        {authors.length > 1 && (
          <select
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            aria-label="Filter by author"
            className="min-w-0 flex-1 rounded-sm border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] sm:flex-none"
          >
            <option value="">All authors</option>
            {authors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          aria-label="Sort studies"
          className="min-w-0 flex-1 rounded-sm border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] sm:flex-none"
        >
          {SORTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--line)] px-2 py-1">
        {SOURCES.map((option) => {
          const active = source === option.id;
          return (
            <button
              key={option.id}
              onClick={() => setSource(option.id)}
              className={`shrink-0 border-b-2 px-2.5 py-1.5 text-[12px] transition ${
                active
                  ? "border-[var(--accent)] font-medium text-[var(--text)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {option.label}
              <span className="ml-1 text-[11px] tabular-nums text-[var(--muted)]">
                {" "}
                {counts[option.id]}
              </span>
            </button>
          );
        })}

        <p className="ml-auto shrink-0 pl-3 text-[11px] text-[var(--muted)]">
          {visible.length} of {studies.length}
          {filtering && (
            <button onClick={clear} className="ml-2 text-[var(--accent)] underline">
              clear
            </button>
          )}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-[var(--muted)]">Nothing matches that search.</p>
          <button
            onClick={clear}
            className="mt-3 rounded-sm border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {visible.map((study) => (
            <li key={study.id}>
              <Link
                href={`/community/${study.id}`}
                className="group grid grid-cols-[56px_minmax(0,1fr)_44px] items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--panel-2)] sm:gap-4 sm:px-4 sm:py-3"
              >
                <MiniBoard fen={study.finalFen} size={56} />

                <div className="min-w-0">
                  <h2 className="line-clamp-2 text-[13.5px] font-medium leading-snug transition group-hover:text-[var(--accent)]">
                    {study.title}
                  </h2>
                  <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
                    {study.subtitle}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10.5px] text-[var(--muted)]">
                    <span className="font-medium text-[var(--text)]">
                      {study.author || "Community"}
                    </span>
                    <span className="text-[var(--line)]">·</span>
                    <span>{study.plies} plies</span>
                    <span className="text-[var(--line)]">·</span>
                    <span>
                      {study.commentCount} note{study.commentCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-[var(--line)]">·</span>
                    <span>{formatDate(study.createdAt)}</span>
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-[13px] font-semibold tabular-nums">
                    {formatResult(study.result)}
                  </div>
                  <div className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    {study.source === "lichess" ? "Lichess" : "Player"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
