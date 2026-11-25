import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendChangeRequestToAdmins } from "@/lib/emails";

export const dynamic = "force-dynamic";

const MAX_PER_INTERVIEW = 40;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sql = db();
  const [i] = await sql`SELECT * FROM interviews WHERE approval_token = ${token}`;
  if (!i || i.status !== "awaiting_approval") return NextResponse.json({ error: "This interview can't be changed now." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim().slice(0, 8000);
  const heading = String(body?.heading ?? "").trim().slice(0, 300);
  const questionId = Number.isInteger(body?.questionId) ? body.questionId : null;
  if (text.length < 3) return NextResponse.json({ error: "Please describe the change." }, { status: 400 });
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM change_requests WHERE interview_id = ${i.id}`;
  if (n >= MAX_PER_INTERVIEW) return NextResponse.json({ error: "Too many change requests. Please reply to our email instead." }, { status: 429 });
  await sql`INSERT INTO change_requests (interview_id, question_id, heading, text) VALUES (${i.id}, ${questionId}, ${heading}, ${text})`;
  await sendChangeRequestToAdmins(i as never, heading, text).catch((err) => console.error("[change] email failed:", err));
  return NextResponse.json({ ok: true });
}
