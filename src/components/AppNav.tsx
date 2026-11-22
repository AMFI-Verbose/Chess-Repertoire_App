"use client";

import Link from "next/link";
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

export default function AppNav({
  user,
}: {
  user: { handle: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f0d9b5] text-sm text-[#b58863]">
            ♞
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Chess Repertoire
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1 text-sm">
          {LINKS.map((link) => {
            // Exact-segment matching: plain startsWith would make "/play"
            // match "/puzzles" as well.
            const active =
              link.href === "/"
                ? pathname === "/" || pathname.startsWith("/r/")
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 transition ${
                  active
                    ? "bg-[var(--panel)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {user ? (
            <div className="ml-2 flex items-center gap-1 border-l border-[var(--line)] pl-2">
              <Link
                href="/community"
                className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--accent)]"
                title={user.handle}
              >
                @{user.handle}
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
              className="ml-2 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
