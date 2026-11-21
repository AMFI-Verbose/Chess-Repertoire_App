/**
 * Learn progress, kept on this device.
 *
 * Small enough that a database would be overkill, and the shape a paid product
 * will move to a real account: lessons completed, XP, streak days, and whether
 * the Pro chapters are unlocked.
 */

import type { Lesson } from "@/lib/learn";

export type LearnProgress = {
  completed: string[];
  /** Lesson ids the student opened, most recent last. */
  recent: string[];
  /** ISO dates (YYYY-MM-DD) on which at least one lesson was finished. */
  days: string[];
  /** Preview entitlement for the Pro chapters, until accounts and billing exist. */
  pro: boolean;
};

const KEY = "chess.learn.v2";

export function emptyProgress(): LearnProgress {
  return { completed: [], recent: [], days: [], pro: true };
}

export function loadProgress(): LearnProgress {
  if (typeof window === "undefined") return emptyProgress();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // Carry over the earlier single-page progress so nobody loses lessons.
      const legacy = window.localStorage.getItem("chess.learn.v1");
      const completed = legacy ? JSON.parse(legacy) : [];
      return {
        ...emptyProgress(),
        completed: Array.isArray(completed) ? completed.filter((id) => typeof id === "string") : [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      days: Array.isArray(parsed.days) ? parsed.days : [],
      pro: typeof parsed.pro === "boolean" ? parsed.pro : true,
    };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: LearnProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(progress));
}

export function xpForLesson(lesson: Lesson): number {
  const asks = lesson.steps.filter((step) => step.ask).length;
  return 40 + asks * 10 + Math.round(lesson.minutes * 2);
}

export function totalXp(completed: string[], lessons: Lesson[]): number {
  return lessons
    .filter((lesson) => completed.includes(lesson.id))
    .reduce((sum, lesson) => sum + xpForLesson(lesson), 0);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Consecutive days ending today (or yesterday, if today is not done yet). */
export function streakDays(days: string[]): number {
  if (days.length === 0) return 0;
  const unique = [...new Set(days)].sort();
  const last = unique[unique.length - 1];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (last !== today() && last !== yesterday) return 0;

  let streak = 1;
  let cursor = new Date(`${last}T00:00:00Z`);
  for (let index = unique.length - 2; index >= 0; index -= 1) {
    const previous = unique[index];
    const expected = new Date(cursor.getTime() - 86_400_000).toISOString().slice(0, 10);
    if (previous !== expected) break;
    streak += 1;
    cursor = new Date(`${previous}T00:00:00Z`);
  }
  return streak;
}

/** Record a finished lesson exactly once, awarding XP and a streak day. */
export function completeLesson(progress: LearnProgress, lessonId: string): LearnProgress {
  const completed = progress.completed.includes(lessonId)
    ? progress.completed
    : [...progress.completed, lessonId];
  const days = progress.days.includes(today())
    ? progress.days
    : [...progress.days, today()];
  const next = { ...progress, completed, days };
  saveProgress(next);
  return next;
}

export function rememberLesson(progress: LearnProgress, lessonId: string): LearnProgress {
  const recent = [...progress.recent.filter((id) => id !== lessonId), lessonId].slice(-12);
  const next = { ...progress, recent };
  saveProgress(next);
  return next;
}
