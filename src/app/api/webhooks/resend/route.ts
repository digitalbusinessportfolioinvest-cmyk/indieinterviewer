import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Verifies a Svix-signed webhook (the scheme Resend uses). */
function verify(secret: string, id: string, timestamp: string, body: string, signatures: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  return signatures.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await req.text();
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  const ok = verify(
    secret,
    req.headers.get("svix-id") ?? "",
    req.headers.get("svix-timestamp") ?? "",
    body,
    req.headers.get("svix-signature") ?? "",
  );
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const event = JSON.parse(body);
  const type: string = event.type ?? "";
  const emailId: string | undefined = event.data?.email_id;
  const status = type === "email.bounced" ? "bounced" : type === "email.complained" ? "complained" : type === "email.delivered" ? "delivered" : null;
  if (status && emailId) {
    await db()`UPDATE email_log SET status = ${status}, detail = ${type} WHERE resend_id = ${emailId}`;
  }
  return NextResponse.json({ ok: true });
}
