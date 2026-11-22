"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { signIn, signUp } from "@/app/auth/actions";

/**
 * One form for both doors: sign up takes an email, a public handle and a
 * password; sign in accepts either the email or the handle.
 */
export default function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ message?: string; devLink?: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "signup"
          ? await signUp({ email, handle, password })
          : await signIn({ identity, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (mode === "signup") {
        // Stay on the page: the account is created but the address is not
        // confirmed yet, and the next step is clicking that link.
        setDone({ message: result.message, devLink: result.devLink });
        return;
      }
      router.push("/community");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-[var(--accent)]">Account created</p>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          {done.message ?? "Confirm your email to unlock publishing and notes."}
        </p>
        {done.devLink && (
          <a
            href={done.devLink}
            className="break-all rounded-md border border-[var(--accent)]/50 px-3 py-2 text-xs text-[var(--accent)] underline"
          >
            No mail server configured — open your confirmation link (local mode)
          </a>
        )}
        <button
          onClick={() => {
            router.push("/community");
            router.refresh();
          }}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Continue to the community
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === "signup" ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              placeholder="you@example.com"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Handle
            </span>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              className={inputClass}
              placeholder="the name shown on your studies"
              pattern="[a-z0-9_]{3,20}"
              maxLength={20}
              required
            />
          </label>
        </>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Email or handle
          </span>
          <input
            value={identity}
            onChange={(event) => setIdentity(event.target.value)}
            className={inputClass}
            placeholder="you@example.com"
            autoComplete="username"
            required
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Password
        </span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
          placeholder={mode === "signup" ? "at least 8 characters" : "your password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={mode === "signup" ? 8 : undefined}
          required
        />
      </label>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy
          ? mode === "signup"
            ? "Creating account…"
            : "Signing in…"
          : mode === "signup"
            ? "Create account"
            : "Sign in"}
      </button>

      <p className="mt-1 text-center text-xs text-[var(--muted)]">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--accent)]">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-[var(--accent)]">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
