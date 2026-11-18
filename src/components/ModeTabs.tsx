"use client";

import Link from "next/link";

const TABS = [
  { key: "build", label: "Build" },
  { key: "play", label: "Play" },
  { key: "review", label: "Review" },
] as const;

export type ModeKey = (typeof TABS)[number]["key"];

/**
 * Build / Play / Review switcher. Three routes, one segmented control, so the
 * app reads as a single product rather than three demos.
 */
export default function ModeTabs({
  repertoireId,
  active,
}: {
  repertoireId: string;
  active: ModeKey;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
      {TABS.map((tab) => {
        const href =
          tab.key === "build" ? `/r/${repertoireId}` : `/r/${repertoireId}/${tab.key}`;
        const isActive = tab.key === active;

        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-[var(--accent)] text-[#0b1602]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
