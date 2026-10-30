import { NextResponse } from "next/server";
import { finishInterview, getInterviewByToken } from "@/lib/interview";
import { founderState } from "@/lib/founder-state";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await finishInterview(token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const i = await getInterviewByToken(token);
  return NextResponse.json(await founderState(i!));
}
