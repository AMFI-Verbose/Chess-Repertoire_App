"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { CHAPTERS, LESSONS, lessonById, totalMinutes } from "@/lib/learn";
import {
  loadProgress,
  saveProgress,
  streakDays,
  totalXp,
  type LearnProgress,
} from "@/lib/learnProgress";

export default function LearnOverview() {
  const [progress, setProgress] = useState<LearnProgress | null>(null);
  const [locked, setLocked] = useState<string | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  function update(next: LearnProgress) {
    saveProgress(next);
    setProgress(next);
  }

  const done = useMemo(() => progress?.completed ?? [], [progress]);
  const completedCount = LESSONS.filter((lesson) => done.includes(lesson.id)).length;
  const xp = useMemo(() => totalXp(done, LESSONS), [done]);
  const streak = progress ? streakDays(progress.days) : 0;
  const nextLesson = LESSONS.find((lesson) => !done.includes(lesson.id)) ?? LESSONS[0];
  const pro = progress?.pro ?? true;

  const minutesLeft = LESSONS.filter((lesson) => !done.includes(lesson.id)).reduce(
    (sum, lesson) => sum + lesson.minutes,
    0,
  );

  function togglePro() {
    if (!progress) return;
    update({ ...progress, pro: !progress.pro });
  }

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-6 py-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <Link
            href="/openings"
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            ← Opening library
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Learn</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            {LESSONS.length} lessons in {CHAPTERS.length} chapters, {totalMinutes()} minutes of
            chess. Every position is played out on a real board, and the coach
            answers your own moves — wrong ones get an engine check, not a shrug.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {[
            { label: "Lessons", value: `${completedCount}/${LESSONS.length}` },
            { label: "XP", value: xp.toLocaleString() },
            { label: "Streak", value: `${streak}d` },
            { label: "Left", value: `${minutesLeft}m` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5"
            >
              <p className="text-lg font-semibold tabular-nums">{item.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </header>

      <Link
        href={`/learn/${nextLesson.id}`}
        className="group mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--accent)]/50 bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bots/marlow.png"
          alt="Coach"
          className="h-11 w-11 shrink-0 rounded-full object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wider text-[var(--accent)]">
            {completedCount === 0 ? "Start here" : completedCount === LESSONS.length ? "All done — replay" : "Continue"}
          </span>
          <span className="mt-0.5 block font-medium">{nextLesson.title}</span>
          <span className="mt-0.5 block text-xs text-[var(--muted)]">
            {nextLesson.blurb}
          </span>
        </span>
        <span className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b1602] transition group-hover:translate-x-0.5">
          Open lesson →
        </span>
      </Link>

      <section className="mb-8 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              Pro chapters {pro ? "preview — unlocked on this device" : "locked"}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
              Chapter 4–5 and the advanced mates are the paid shelf: endgame
              technique, opening plans, and the coach drills that go with them.
              Billing is not wired yet, so this switch is the gate it will use.
            </p>
          </div>
          <button
            onClick={togglePro}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs transition hover:border-[var(--accent)]"
          >
            {pro ? "Lock Pro (see the paywall)" : "Unlock preview"}
          </button>
        </div>
      </section>

      {locked && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--panel-2)] px-4 py-3">
          <p className="text-xs">
            <span className="font-medium">{locked}</span> is part of Pro. Turn the
            preview on above to play it.
          </p>
          <button
            onClick={() => {
              togglePro();
              setLocked(null);
            }}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b1602]"
          >
            Unlock preview
          </button>
        </div>
      )}

      <div className="flex flex-col gap-7">
        {CHAPTERS.map((chapter, chapterIndex) => {
          const chapterDone = chapter.lessons.filter((lesson) => done.includes(lesson.id)).length;
          const percent = Math.round((chapterDone / chapter.lessons.length) * 100);
          const proChapter = chapter.lessons.every((lesson) => lesson.tier === "pro");
          return (
            <section key={chapter.id}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Chapter {chapterIndex + 1}
                    {proChapter && (
                      <span className="ml-2 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] text-[var(--accent)]">
                        pro
                      </span>
                    )}
                  </p>
                  <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{chapter.title}</h2>
                  <p className="text-xs text-[var(--muted)]">{chapter.blurb}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--panel-2)]">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {chapterDone}/{chapter.lessons.length}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {chapter.lessons.map((lesson, lessonIndex) => {
                  const isDone = done.includes(lesson.id);
                  const isLocked = lesson.tier === "pro" && !pro;
                  const card = (
                    <>
                      <span className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        <span>
                          {lessonIndex + 1}. {lesson.minutes} min
                        </span>
                        <span className="flex items-center gap-1.5">
                          {lesson.tier === "pro" && (
                            <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] text-[var(--accent)]">
                              pro
                            </span>
                          )}
                          {isDone && <span className="text-[var(--accent)]">✓</span>}
                          {isLocked && <span>🔒</span>}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm font-medium leading-snug">
                        {lesson.title}
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-[var(--muted)]">
                        {lesson.blurb}
                      </span>
                    </>
                  );

                  return isLocked ? (
                    <button
                      key={lesson.id}
                      onClick={() => setLocked(lesson.title)}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel)]/60 px-4 py-3 text-left opacity-80 transition hover:border-[var(--muted)]"
                    >
                      {card}
                    </button>
                  ) : (
                    <Link
                      key={lesson.id}
                      href={`/learn/${lesson.id}`}
                      className={[
                        "rounded-xl border bg-[var(--panel)] px-4 py-3 transition",
                        isDone
                          ? "border-[var(--accent)]/40 hover:border-[var(--accent)]"
                          : "border-[var(--line)] hover:border-[var(--accent)]",
                      ].join(" ")}
                    >
                      {card}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {progress && progress.recent.length > 0 && (
        <section className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Recently opened</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...progress.recent].reverse().slice(0, 5).map((id) => {
              const lesson = lessonById(id);
              if (!lesson) return null;
              return (
                <Link
                  key={id}
                  href={`/learn/${id}`}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                >
                  {lesson.title}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
