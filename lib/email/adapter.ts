/**
 * lib/email/adapter.ts
 *
 * Email transport adapter — clean stub, production-ready to swap.
 *
 * To activate real sending, set ONE of:
 *   RESEND_API_KEY               — Resend (recommended, zero-config)
 *   SMTP_HOST + SMTP_USER +
 *   SMTP_PASS + SMTP_FROM        — Nodemailer / any SMTP relay
 *
 * The public interface is intentionally narrow — callers never change
 * when the transport is swapped. Only this file changes.
 */

export interface EmailMessage {
  to:      string[];   // recipient addresses (non-empty)
  subject: string;
  html:    string;
  text?:   string;     // plain-text fallback
}

/**
 * Send an email.
 *
 * Current implementation: console-only stub (safe in all environments).
 * Replace the body between the STUB delimiters when transport is configured.
 */
export async function sendEmail(
  msg: EmailMessage,
): Promise<{ ok: boolean; error?: string }> {

  if (!msg.to.length) return { ok: false, error: "No recipients provided" };

  // ── STUB ──────────────────────────────────────────────────────────────────
  // RESEND (npm install resend):
  //
  //   import { Resend } from "resend";
  //   const resend = new Resend(process.env.RESEND_API_KEY!);
  //   const { error } = await resend.emails.send({
  //     from:    "Agentik <noreply@yourdomain.com>",
  //     to:      msg.to,
  //     subject: msg.subject,
  //     html:    msg.html,
  //     text:    msg.text,
  //   });
  //   return error ? { ok: false, error: error.message } : { ok: true };
  //
  // NODEMAILER (npm install nodemailer):
  //
  //   import nodemailer from "nodemailer";
  //   const t = nodemailer.createTransport({
  //     host: process.env.SMTP_HOST,
  //     port: Number(process.env.SMTP_PORT ?? 587),
  //     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  //   });
  //   await t.sendMail({
  //     from: process.env.SMTP_FROM,
  //     to:   msg.to.join(", "),
  //     subject: msg.subject,
  //     html: msg.html,
  //     text: msg.text,
  //   });
  //   return { ok: true };
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    "[email:stub] to=%s  subject=%s  html_bytes=%d",
    msg.to.join(", "),
    msg.subject,
    msg.html.length,
  );

  return { ok: true };
}

/**
 * True when a real transport is available.
 * Use this to skip email dispatch in environments without credentials.
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}
