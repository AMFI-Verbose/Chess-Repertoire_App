import Link from "next/link";

import AuthForm from "@/components/AuthForm";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Create an account · Chess Repertoire" };

export default async function SignupPage() {
  const viewer = await getViewer();

  return (
    <main className="mx-auto max-w-md px-6 py-14">
      <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
        community
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        A handle is how the community sees you. Publishing a study and posting
        a note both need an account; reading stays open to everyone.
      </p>

      {viewer ? (
        <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
          You are already signed in as
          <span className="ml-1 font-medium text-[var(--accent)]">@{viewer.handle}</span>.
          <Link href="/community" className="mt-3 block text-xs text-[var(--muted)] underline">
            Back to the community
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <AuthForm mode="signup" />
        </div>
      )}
    </main>
  );
}
