import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

/**
 * Verification email delivery.
 *
 * Three modes, in order: Resend (one HTTPS call, ideal on Vercel), SMTP
 * (nodemailer, ideal self-hosted), or a development fallback that returns the
 * link to the caller and logs it. The fallback is explicit, not silent: the UI
 * shows the link so a local install still works with no mail server.
 */

export const APP_URL =
  process.env.APP_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

const FROM = process.env.MAIL_FROM || "Chess Repertoire <no-reply@localhost>";

export type Delivery = { delivered: boolean; devLink?: string };

async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
    return true;
  }

  if (process.env.SMTP_HOST) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transport.sendMail({
      from: FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return true;
  }

  return false;
}

/** Create a fresh token (old ones are invalidated) and try to deliver it. */
export async function sendVerificationEmail(
  userId: string,
  email: string,
): Promise<Delivery> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.emailToken.deleteMany({ where: { userId } });
  await prisma.emailToken.create({ data: { token, userId, expiresAt } });

  const link = `${APP_URL}/verify?token=${token}`;
  const subject = "Confirm your chess community account";
  const text = [
    "One click and your account is confirmed:",
    link,
    "",
    "The link expires in 24 hours. If you did not sign up, ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;background:#12100e;padding:32px;color:#e9e5de">
      <h2 style="margin:0 0 12px">Confirm your account</h2>
      <p style="color:#a8a29e;margin:0 0 20px">Publishing games and writing notes needs a confirmed address.</p>
      <a href="${link}" style="display:inline-block;background:#9bc700;color:#04231d;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Confirm email</a>
      <p style="color:#78716c;font-size:12px;margin-top:20px">${link}</p>
    </div>`;

  try {
    const delivered = await sendMail({ to: email, subject, text, html });
    if (delivered) return { delivered: true };
  } catch (error) {
    console.error("verification email failed:", error);
  }

  // No mail transport configured (or the provider failed). Honest development
  // mode: hand the link back and log it, instead of pretending it was sent.
  console.log(`[verification] ${email}: ${link}`);
  return { delivered: false, devLink: link };
}

export async function confirmToken(token: string): Promise<{ handle: string } | null> {
  const row = await prisma.emailToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, handle: true } } },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.emailToken.deleteMany({ where: { id: row.id } });
    return null;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true } }),
    prisma.emailToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  return { handle: row.user.handle };
}
