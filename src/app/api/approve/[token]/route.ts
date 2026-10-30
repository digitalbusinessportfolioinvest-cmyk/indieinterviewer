import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getQuestionnaire, type Interview } from "@/lib/interview";
import { sendApprovedToAdmins } from "@/lib/emails";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (body.accepted !== true) return NextResponse.json({ error: "Please tick the box to accept the text." }, { status: 400 });

  const sql = db();
  const [row] = await sql`SELECT * FROM interviews WHERE approval_token = ${token}`;
  const i = row as unknown as Interview | undefined;
  if (!i) return NextResponse.json({ error: "Interview not found." }, { status: 404 });
  if (i.status !== "awaiting_approval") return NextResponse.json({ error: "This interview is not awaiting approval." }, { status: 400 });

  const qn = await getQuestionnaire(i.questionnaire_id);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const [updated] = await sql`
    UPDATE interviews SET status = 'approved', approved_at = now(), approval_clause = ${qn.rights_clause},
      approval_email = ${i.founder_email}, approval_ip = ${ip}, updated_at = now()
    WHERE id = ${i.id} AND status = 'awaiting_approval' RETURNING id`;
  if (updated) void sendApprovedToAdmins(i).catch(() => {});
  return NextResponse.json({ ok: true });
}
