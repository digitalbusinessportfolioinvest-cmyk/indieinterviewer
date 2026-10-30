import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInterviewByToken } from "@/lib/interview";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, putObject } from "@/lib/storage";
import { randomToken } from "@/lib/tokens";
import { founderState } from "@/lib/founder-state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILES = 20;

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
    return NextResponse.json({ error: "Please upload images (PNG, JPG, WebP, GIF, SVG) or PDF files." }, { status: 400 });
  }
  const [{ count }] = await db()`SELECT count(*)::int AS count FROM uploads WHERE interview_id = ${i.id}`;
  if (count >= MAX_FILES) return NextResponse.json({ error: `You can upload up to ${MAX_FILES} files.` }, { status: 400 });

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
  const key = `interviews/${i.id}/${randomToken(8)}-${safeName}`;
  try {
    await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (err) {
    console.error("[upload] failed:", err);
    return NextResponse.json({ error: "The upload failed. Please try again." }, { status: 500 });
  }
  await db()`
    INSERT INTO uploads (interview_id, object_key, filename, content_type, size_bytes)
    VALUES (${i.id}, ${key}, ${safeName}, ${file.type}, ${file.size})`;
  return NextResponse.json(await founderState(i));
}
