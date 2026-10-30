import { NextResponse } from "next/server";
import { createSession, currentAdmin } from "@/lib/auth";
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } from "@/lib/passkeys";

export const dynamic = "force-dynamic";

/** Single endpoint: { step: "register-options" | "register-verify" | "login-options" | "login-verify", response? } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    switch (body.step) {
      case "register-options": {
        const email = await currentAdmin();
        if (!email) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
        return NextResponse.json(await registrationOptions(email));
      }
      case "register-verify": {
        const email = await currentAdmin();
        if (!email) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
        await verifyRegistration(email, body.response);
        return NextResponse.json({ ok: true });
      }
      case "login-options":
        return NextResponse.json(await authenticationOptions());
      case "login-verify": {
        const email = await verifyAuthentication(body.response);
        await createSession(email);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown step." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Passkey error." }, { status: 400 });
  }
}
