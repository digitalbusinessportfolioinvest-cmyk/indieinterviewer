import { NextResponse } from "next/server";
import { consumeMagicLink, createSession, hasPasskey } from "@/lib/auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const base = config.appUrl();
  const email = token ? await consumeMagicLink(token) : null;
  if (!email) return NextResponse.redirect(`${base}/admin/login?error=link`);
  await createSession(email);
  const next = (await hasPasskey(email)) ? "/admin" : "/admin/passkey";
  return NextResponse.redirect(`${base}${next}`);
}
