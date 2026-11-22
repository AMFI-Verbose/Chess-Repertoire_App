"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";

const LINKS = [
  { href: "/", label: "Repertoires" },
  { href: "/play", label: "Play" },
  { href: "/openings", label: "Openings" },
  { href: "/puzzles", label: "Puzzles" },
  { href: "/learn", label: "Learn" },
  { href: "/train", label: "Train" },
  { href: "/games", label: "Games" },
  { href: "/community", label: "Community" },
];

/**
 * A link that says "working on it" the moment it is tapped. Without this, a
 * slow navigation looks exactly like a dead button and people tap twice.
 */
function PendingAware({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`transition-opacity ${pending ? "opacity-45" : "opacity-100"}`}
      aria-busy={pending || undefined}
    >
      {children}
    </span>
  );
}

export default function AppNav({
  user,
}: {
  user: { handle: string; emailVerified: boolean } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // A route change closes the sheet; a tap closes it immediately too, so
  // choosing the page you are already on never looks like a dead button.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function isActive(href: string) {
    // Exact-segment matching: plain startsWith would make "/play" match
    // "/puzzles" as well.
    return href === "/"
      ? pathname === "/" || pathname.startsWith("/r/")
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  const linkClass = (href: string, wide: boolean) =>
    `block rounded-md text-center transition ${
      wide ? "px-2.5 py-1.5" : "px-2 py-2 text-[13px]"
    } ${
      isActive(href)
        ? "bg-[var(--panel)] text-[var(--text)]"
        : "text-[var(--muted)] hover:bg-[var(--panel)]/60 hover:text-[var(--text)]"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f0d9b5] text-sm text-[#b58863]">
            ♞
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Chess Repertoire
          </span>
        </Link>

        {/* Wide screens: every link inline. */}
        <nav className="ml-auto hidden min-w-0 items-center gap-0.5 text-sm lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={linkClass(link.href, true)}
            >
              <PendingAware>{link.label}</PendingAware>
            </Link>
          ))}
        </nav>

        {/* Narrow screens: one reliable target instead of clipped links. */}
        <div className="ml-auto flex items-center gap-1 lg:ml-2">
          {user ? (
            <div className="flex items-center gap-1">
              <Link
                href="/community"
                className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--accent)]"
                title={`Signed in as ${user.handle}`}
              >
                @{user.handle}
                {!user.emailVerified && (
                  <span
                    className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle"
                    title="Email not confirmed — publishing is locked"
                  />
                )}
              </Link>
              <button
                onClick={async () => {
                  await signOutAction();
                  router.refresh();
                }}
                className="rounded-md px-2 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <PendingAware>Sign in</PendingAware>
            </Link>
          )}

          <button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Open menu"
            className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] lg:hidden"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-[var(--line)] bg-[var(--bg)] px-3 pb-3 pt-2 lg:hidden">
          <div className="grid grid-cols-3 gap-1.5">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={linkClass(link.href, false)}
              >
                <PendingAware>{link.label}</PendingAware>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
