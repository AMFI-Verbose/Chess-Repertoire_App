"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { StudySummary } from "@/app/actions";

type Sort = "newest" | "discussed" | "title";
type Source = "all" | "lichess" | "local";

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "discussed", label: "Most discussed" },
  { id: "title", label: "A–Z" },
];

/**
 * The community index: live search across title, idea and author, plus the
 * three orderings a reader actually uses. Everything runs on the already-loaded
 * list, so typing never waits on the database.
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = studies.filter((study) => {
      if (source === "lichess" && study.source !== "lichess") return false;
      if (source === "local" && study.source !== "local") return false;
      if (author && study.author !== author) return false;
      if (!needle) return true;
      return [study.title, study.subtitle, study.author]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return rows.sort((a, b) => {
      if (sort === "discussed") return b.commentCount - a.commentCount || a.title.localeCompare(b.title);
      if (sort === "title") return a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [studies, query, sort, author, source]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search games, ideas, players…"
            aria-label="Search studies"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 pl-9 text-sm outline-none transition focus:border-[var(--accent)]"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">
            ⌕
          </span>
        </div>

        {authors.length > 1 && (
          <select
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            aria-label="Filter by author"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-2 text-xs text-[var(--muted)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">All authors</option>
            {authors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}

        <div className="flex rounded-lg border border-[var(--line)] bg-[var(--panel)] p-0.5">
          {(
            [
              ["all", "All"],
              ["lichess", "Lichess"],
              ["local", "Players"],
            ] as [Source, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSource(id)}
              className={`rounded-md px-2.5 py-1.5 text-[11px] transition ${
                source === id
                  ? "bg-[var(--accent)] text-[#04231d]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-[var(--line)] bg-[var(--panel)] p-0.5">
          {SORTS.map((option) => (
            <button
              key={option.id}
              onClick={() => setSort(option.id)}
              className={`rounded-md px-2.5 py-1.5 text-[11px] transition ${
                sort === option.id
                  ? "bg-[var(--accent)] text-[#04231d]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-[var(--muted)]">
        {visible.length} of {studies.length} game{studies.length === 1 ? "" : "s"}
        {query.trim() ? ` matching “${query.trim()}”` : ""}
      </p>

      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--line)] px-5 py-10 text-center">
            <p className="text-sm text-[var(--muted)]">Nothing matches that search.</p>
            <button
              onClick={() => {
                setQuery("");
                setAuthor("");
                setSource("all");
              }}
              className="mt-3 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Clear filters
            </button>
          </div>
        )}

        {visible.map((study) => (
          <Link
            key={study.id}
            href={`/community/${study.id}`}
            className="group flex items-start gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
          >
            <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[#f0d9b5] text-xs font-semibold text-[#b58863]">
              {(study.author || "?").slice(0, 1).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium leading-snug transition group-hover:text-[var(--accent)]">
                  {study.title}
                </h2>
                {study.eco && (
                  <span className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                    {study.eco}
                  </span>
                )}
                {study.source === "lichess" && (
                  <span className="rounded-md border border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                    Lichess
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                {study.subtitle}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-[var(--muted)]">
                <span>{study.author || "Community"}</span>
                <span>·</span>
                <span>{study.plies} plies</span>
                <span>·</span>
                <span>
                  {study.commentCount} note{study.commentCount === 1 ? "" : "s"}
                </span>
              </p>
            </div>

            <span className="mt-1 shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)]">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
