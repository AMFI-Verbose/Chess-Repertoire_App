"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

/**
 * No payment provider is connected yet, so this records a pledge instead of
 * charging a card. The UI says so in plain words; it never pretends otherwise.
 */
export async function donateAction(formData: FormData) {
  const preset = Number(formData.get("preset") ?? 0);
  const custom = Number(formData.get("custom") ?? 0);
  const amount =
    Number.isFinite(custom) && custom > 0 ? Math.round(custom * 100) : Math.round(preset * 100);

  if (!Number.isFinite(amount) || amount < 100 || amount > 100_000) {
    redirect("/support?error=amount");
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "Anonymous";
  const message = String(formData.get("message") ?? "").trim().slice(0, 240);
  const recurring = formData.get("recurring") === "on";

  await prisma.donation.create({ data: { name, amountCents: amount, recurring, message } });
  redirect("/support?thanks=1");
}
