import { NextResponse } from "next/server";
import { editAnswer, getInterviewByToken } from "@/lib/interview";
import { founderState } from "@/lib/founder-state";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const result = await editAnswer(token, Number(body.questionId), String(body.text ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const i = await getInterviewByToken(token);
  return NextResponse.json(await founderState(i!));
}
