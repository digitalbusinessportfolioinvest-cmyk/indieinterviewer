import { db } from "./db";
import { deleteObjects, putObject } from "./storage";
import { randomToken } from "./tokens";

const SOCIAL = /(^|\.)(x\.com|twitter\.com|linkedin\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.com|tiktok\.com|threads\.net|bsky\.app|github\.com|medium\.com|reddit\.com|producthunt\.com|indiehackers\.com|t\.co|linktr\.ee|calendly\.com|gmail\.com)$/i;
const URLISH = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/[^\s)<>"']*)?)/gi;

/** First non-social website mentioned in the texts, as an absolute URL. */
export function findWebsite(texts: string[]): string | null {
  for (const t of texts) {
    for (const m of t.matchAll(URLISH)) {
      const raw = m[1].replace(/[.,;:!?]+$/, "");
      if (/@/.test(t.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0))) continue; // part of an email
      try {
        const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        const host = u.hostname.replace(/^www\./, "");
        if (SOCIAL.test(host) || !host.includes(".")) continue;
        return `https://${u.hostname}/`;
      } catch { /* not a URL */ }
    }
  }
  return null;
}

/** Website from the founder's answers, preferring the last public answers (the links question). */
export async function websiteFromAnswers(interviewId: number): Promise<string | null> {
  const rows = await db()`
    SELECT a.text FROM answers a JOIN questions q ON q.id = a.question_id
    WHERE a.interview_id = ${interviewId} AND a.skipped = false AND q.layer = 'public'
    ORDER BY q.position DESC`;
  return findWebsite(rows.map((r) => String(r.text ?? "")));
}

export type ShotResult = { ok: boolean; message: string; url?: string };

/** Takes a screenshot of the homepage and stores it with the interview's images, replacing any previous one. */
export async function takeHomepageScreenshot(interviewId: number, explicitUrl?: string | null): Promise<ShotResult> {
  const sql = db();
  let url = explicitUrl?.trim() || null;
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!url) url = await websiteFromAnswers(interviewId);
  if (!url) {
    await sql`UPDATE interviews SET screenshot_error = 'No website found in the answers.' WHERE id = ${interviewId}`;
    return { ok: false, message: "No website found in the founder's answers. Give the URL." };
  }
  const base = process.env.SCREENSHOT_URL;
  const token = process.env.SCREENSHOT_TOKEN;
  if (!base || !token) return { ok: false, message: "Screenshot service is not configured.", url };
  let png: Uint8Array;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/shot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-token": token },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    png = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    const msg = `Screenshot of ${url} failed: ${(err as Error).message}`;
    await sql`UPDATE interviews SET homepage_url = ${url}, screenshot_error = ${msg} WHERE id = ${interviewId}`;
    return { ok: false, message: msg, url };
  }
  const host = new URL(url).hostname.replace(/^www\./, "");
  const filename = `homepage-${host}.png`;
  const key = `interviews/${interviewId}/${randomToken(8)}-${filename}`;
  await putObject(key, png, "image/png");
  const old = await sql`SELECT object_key FROM uploads WHERE interview_id = ${interviewId} AND kind = 'screenshot'`;
  await sql.begin(async (tx) => {
    await tx`DELETE FROM uploads WHERE interview_id = ${interviewId} AND kind = 'screenshot'`;
    await tx`INSERT INTO uploads (interview_id, object_key, filename, content_type, size_bytes, kind)
             VALUES (${interviewId}, ${key}, ${filename}, 'image/png', ${png.byteLength}, 'screenshot')`;
    await tx`UPDATE interviews SET homepage_url = ${url}, screenshot_error = NULL WHERE id = ${interviewId}`;
  });
  if (old.length) await deleteObjects(old.map((o) => o.object_key as string)).catch(() => {});
  return { ok: true, message: `Homepage screenshot taken from ${url}.`, url };
}
