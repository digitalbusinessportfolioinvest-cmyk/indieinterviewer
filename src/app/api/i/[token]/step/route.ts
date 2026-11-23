import { NextResponse } from "next/server";
import { closingStep, getInterviewByToken } from "@/lib/interview";
import { founderState } from "@/lib/founder-state";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (!["photo_done", "photo_skip", "review"].includes(action)) return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  const result = await closingStep(token, action);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const i = await getInterviewByToken(token);
  return NextResponse.json(await founderState(i!));
}
