"use client";

import { useEffect, useRef, useState } from "react";

import type { BotProfile } from "@/lib/bots";

export type ChatMessage = {
  id: number;
  from: "bot" | "you";
  text: string;
};

/**
 * The in-game chat: a log of what the character has said plus a box to talk
 * back. Deliberately small — it sits above the game card in the sidebar and
 * must not push the board around.
 */
export default function BotChat({
  bot,
  messages,
  onSend,
}: {
  bot: BotProfile;
  messages: ChatMessage[];
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest line in view as the argument escalates.
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bot.avatar}
          alt={bot.name}
          className="h-8 w-8 rounded-full object-cover"
          style={{ boxShadow: `0 0 0 2px ${bot.accent}` }}
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{bot.name}</p>
          <p className="text-[10px] text-[var(--muted)]">
            ≈{bot.rating} · {bot.style}
          </p>
        </div>
      </div>

      <div
        ref={logRef}
        className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <p className="text-[11px] text-[var(--muted)]">
            Say hello — they usually answer.
          </p>
        ) : (
          messages.map((message) => (
            <p
              key={message.id}
              className={[
                "max-w-[92%] rounded-lg px-2 py-1.5 text-[11px] leading-snug",
                message.from === "bot"
                  ? "bg-[var(--panel-2)] text-[var(--text)]"
                  : "ml-auto bg-[var(--accent)]/15 text-[var(--text)]",
              ].join(" ")}
            >
              {message.text}
            </p>
          ))
        )}
      </div>

      <div className="mt-2 flex gap-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              send();
            }
          }}
          maxLength={140}
          placeholder="Say something…"
          className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1 text-[11px] outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={send}
          className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
        >
          Send
        </button>
      </div>
    </div>
  );
}
