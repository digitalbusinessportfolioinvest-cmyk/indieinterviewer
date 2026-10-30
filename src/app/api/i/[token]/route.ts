import { NextResponse } from "next/server";
import { ensureStarted, getInterviewByToken } from "@/lib/interview";
import { founderState } from "@/lib/founder-state";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let i = await getInterviewByToken(token);
  if (!i) return NextResponse.json({ error: "Interview not found." }, { status: 404 });
  if (i.status === "invited") {
    await ensureStarted(i);
    i = (await getInterviewByToken(token))!;
  }
  return NextResponse.json(await founderState(i));
}
