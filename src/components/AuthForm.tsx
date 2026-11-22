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
      router.push("/community");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
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
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#04231d] transition hover:brightness-110 disabled:opacity-60"
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
