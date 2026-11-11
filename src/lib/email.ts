import { db } from "./db";
import { config } from "./config";

type SendArgs = {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  kind: string;
  interviewId?: number | null;
  idempotencyKey?: string;
  from?: string;
  replyTo?: string;
};

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  if (!key) {
    console.warn(`[email] RESEND_API_KEY missing, not sending "${args.subject}" to ${recipients.join(", ")}`);
    console.warn(args.text);
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (args.idempotencyKey) headers["Idempotency-Key"] = args.idempotencyKey;

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: args.from ?? config.mailFrom(),
          to: recipients,
          reply_to: args.replyTo ?? config.replyTo(),
          subject: args.subject,
          text: args.text,
          html: args.html,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        for (const to of recipients) {
          await db()`
            INSERT INTO email_log (interview_id, kind, to_email, resend_id, status)
            VALUES (${args.interviewId ?? null}, ${args.kind}, ${to}, ${body.id ?? null}, 'sent')`;
        }
        return { ok: true };
      }
      lastError = `${res.status} ${body.message ?? ""}`.trim();
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  for (const to of recipients) {
    await db()`
      INSERT INTO email_log (interview_id, kind, to_email, status, detail)
      VALUES (${args.interviewId ?? null}, ${args.kind}, ${to}, 'failed', ${lastError})`;
  }
  console.error(`[email] failed to send ${args.kind}: ${lastError}`);
  return { ok: false, error: lastError };
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal, client-safe HTML layout. Paragraphs are separated by blank lines. */
export function layout(paragraphs: string[], button?: { label: string; url: string }, headerName = "Indie Hustle", extraHtml = "") {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">${escapeHtml(button.label)}</a></p><p style="margin:0 0 16px;font-size:13px;color:#666;line-height:1.5">Or paste this link into your browser:<br>${escapeHtml(button.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f6f4"><div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;color:#1a1a1a"><div style="font-weight:700;font-size:18px;margin-bottom:24px">${escapeHtml(headerName)}</div>${body}${cta}${extraHtml}</div></body></html>`;
}

export function textWithLink(paragraphs: string[], button?: { label: string; url: string }) {
  return [...paragraphs, ...(button ? [`${button.label}: ${button.url}`] : [])].join("\n\n");
}
