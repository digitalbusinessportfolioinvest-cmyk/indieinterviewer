import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { db } from "./db";
import { config, isAdminEmail } from "./config";
import { randomToken } from "./tokens";

const CHALLENGE_COOKIE = "ii_webauthn";

function rp() {
  const url = new URL(config.appUrl());
  return { rpID: url.hostname, origin: url.origin, rpName: "IndieInterviewer" };
}

async function storeChallenge(challenge: string, email: string | null) {
  const id = randomToken(16);
  await db()`
    INSERT INTO webauthn_challenges (id, challenge, email, expires_at)
    VALUES (${id}, ${challenge}, ${email}, now() + interval '5 minutes')`;
  (await cookies()).set(CHALLENGE_COOKIE, id, { httpOnly: true, secure: config.isProd(), sameSite: "strict", path: "/", maxAge: 300 });
}

async function takeChallenge(): Promise<{ challenge: string; email: string | null } | null> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!id) return null;
  const [row] = await db()`
    DELETE FROM webauthn_challenges WHERE id = ${id} AND expires_at > now() RETURNING challenge, email`;
  return (row as unknown as { challenge: string; email: string | null }) ?? null;
}

export async function registrationOptions(email: string) {
  const existing = await db()`SELECT credential_id, transports FROM admin_passkeys WHERE email = ${email}`;
  const { rpID, rpName } = rp();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: email,
    userDisplayName: email,
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id as string,
      transports: c.transports ? (String(c.transports).split(",") as AuthenticatorTransportFuture[]) : undefined,
    })),
  });
  await storeChallenge(options.challenge, email);
  return options;
}

export async function verifyRegistration(email: string, response: RegistrationResponseJSON) {
  const stored = await takeChallenge();
  if (!stored || stored.email !== email) throw new Error("The passkey request expired. Please try again.");
  const { rpID, origin } = rp();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!result.verified || !result.registrationInfo) throw new Error("The passkey could not be verified.");
  const { credential } = result.registrationInfo;
  await db()`
    INSERT INTO admin_passkeys (credential_id, email, public_key, counter, transports)
    VALUES (${credential.id}, ${email}, ${Buffer.from(credential.publicKey)}, ${credential.counter}, ${(credential.transports ?? []).join(",")})
    ON CONFLICT (credential_id) DO NOTHING`;
}

export async function authenticationOptions() {
  const { rpID } = rp();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await storeChallenge(options.challenge, null);
  return options;
}

export async function verifyAuthentication(response: AuthenticationResponseJSON): Promise<string> {
  const stored = await takeChallenge();
  if (!stored) throw new Error("The sign-in request expired. Please try again.");
  const [cred] = await db()`SELECT * FROM admin_passkeys WHERE credential_id = ${response.id}`;
  if (!cred) throw new Error("This passkey is not registered here.");
  const { rpID, origin } = rp();
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: cred.credential_id,
      publicKey: new Uint8Array(cred.public_key),
      counter: Number(cred.counter),
      transports: cred.transports ? (String(cred.transports).split(",") as AuthenticatorTransportFuture[]) : undefined,
    },
  });
  if (!result.verified) throw new Error("The passkey could not be verified.");
  if (!isAdminEmail(cred.email)) throw new Error("This account no longer has access.");
  await db()`
    UPDATE admin_passkeys SET counter = ${result.authenticationInfo.newCounter}, last_used_at = now()
    WHERE credential_id = ${cred.credential_id}`;
  return cred.email as string;
}
