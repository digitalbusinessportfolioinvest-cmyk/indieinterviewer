// Serves an interview image through a non-expiring signed URL (used in review emails and previews).
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { getObjectBytes } from "@/lib/storage";
import { imageSig } from "@/lib/edition";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; sig: string }> }) {
  const { id, sig } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return new Response("Not found", { status: 404 });
  const a = Buffer.from(sig);
  const b = Buffer.from(imageSig(n));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Not found", { status: 404 });
  const [row] = await db()`SELECT object_key FROM uploads WHERE id = ${n}`;
  if (!row) return new Response("Not found", { status: 404 });
  try {
    const { body, contentType } = await getObjectBytes(row.object_key as string);
    return new Response(Buffer.from(body), { headers: { "content-type": contentType, "cache-control": "private, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
