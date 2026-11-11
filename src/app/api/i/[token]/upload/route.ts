import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInterviewByToken } from "@/lib/interview";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, putObject } from "@/lib/storage";
import { randomToken } from "@/lib/tokens";
import { founderState } from "@/lib/founder-state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILES = 10;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const i = await getInterviewByToken(token);
  if (!i) return NextResponse.json({ error: "Interview not found." }, { status: 404 });
  if (i.status !== "in_progress") return NextResponse.json({ error: "Uploads are closed for this interview." }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files can be up to 10 MB each." }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Please upload images only (PNG, JPG, WebP or GIF)." }, { status: 400 });
  }
  const [{ count }] = await db()`SELECT count(*)::int AS count FROM uploads WHERE interview_id = ${i.id}`;
  if (count >= MAX_FILES) return NextResponse.json({ error: `You can upload up to ${MAX_FILES} images.` }, { status: 400 });

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
  const key = `interviews/${i.id}/${randomToken(8)}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const realType = sniffImage(bytes);
  if (!realType) return NextResponse.json({ error: "That file doesn't look like an image. Please upload PNG, JPG, WebP or GIF." }, { status: 400 });
  try {
    await putObject(key, bytes, realType);
  } catch (err) {
    console.error("[upload] failed:", err);
    return NextResponse.json({ error: "The upload failed. Please try again." }, { status: 500 });
  }
  await db()`
    INSERT INTO uploads (interview_id, object_key, filename, content_type, size_bytes)
    VALUES (${i.id}, ${key}, ${safeName}, ${realType}, ${file.size})`;
  return NextResponse.json(await founderState(i));
}

/** Detects the real image type from the file's first bytes. */
function sniffImage(b: Uint8Array): string | null {
  const starts = (sig: number[], at = 0) => sig.every((v, k) => b[at + k] === v);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
