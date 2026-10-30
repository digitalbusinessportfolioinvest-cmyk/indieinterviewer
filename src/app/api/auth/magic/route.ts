import { NextResponse } from "next/server";
import { createMagicLink } from "@/lib/auth";
import { isAdminEmail } from "@/lib/config";
import { sendMagicLink } from "@/lib/emails";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (email && isAdminEmail(email)) {
    const url = await createMagicLink(email);
    await sendMagicLink(email, url);
  }
  // Same answer either way, so the form doesn't reveal which addresses are admins.
  return NextResponse.json({ ok: true });
}
