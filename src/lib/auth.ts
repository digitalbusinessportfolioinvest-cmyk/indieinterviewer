import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { randomToken, sha256 } from "./tokens";
import { config, isAdminEmail } from "./config";

export const SESSION_COOKIE = "ii_session";
const SESSION_DAYS = 30;
const MAGIC_MINUTES = 20;

export async function createSession(email: string) {
  const id = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db()`INSERT INTO admin_sessions (id, email, expires_at) VALUES (${sha256(id)}, ${email}, ${expires})`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: config.isProd(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await db()`DELETE FROM admin_sessions WHERE id = ${sha256(id)}`;
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in admin email, or null. */
export async function currentAdmin(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const [row] = await db()`
    SELECT email FROM admin_sessions WHERE id = ${sha256(id)} AND expires_at > now()`;
  if (!row) return null;
  // An address removed from ADMIN_EMAILS loses access immediately.
  if (!isAdminEmail(row.email)) return null;
  return row.email as string;
}

export async function requireAdmin(): Promise<string> {
  const email = await currentAdmin();
  if (!email) redirect("/admin/login");
  return email;
}

export async function createMagicLink(email: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + MAGIC_MINUTES * 60_000);
  await db()`
    INSERT INTO admin_magic_links (token_hash, email, expires_at) VALUES (${sha256(token)}, ${email}, ${expires})`;
  return `${config.appUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

export async function consumeMagicLink(token: string): Promise<string | null> {
  const [row] = await db()`
    UPDATE admin_magic_links SET used_at = now()
    WHERE token_hash = ${sha256(token)} AND used_at IS NULL AND expires_at > now()
    RETURNING email`;
  if (!row || !isAdminEmail(row.email)) return null;
  return row.email as string;
}

export async function hasPasskey(email: string) {
  const [row] = await db()`SELECT 1 FROM admin_passkeys WHERE email = ${email} LIMIT 1`;
  return Boolean(row);
}
