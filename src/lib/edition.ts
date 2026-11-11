// The assembled edition: cover (homepage screenshot), rewritten headings, cleaned answers and the
// founder's images placed through the text. Used for the admin review email and the panel preview.
import { createHmac } from "node:crypto";
import { db } from "./db";
import { config } from "./config";
import type { Draft, DraftItem } from "./interview";
import { splitDraft } from "@/components/ArticleView";

export type EditionImage = { id: number; filename: string; url: string };
export type EditionBlock =
  | { type: "section"; label: string }
  | { type: "qa"; heading: string; answer: string }
  | { type: "image"; image: EditionImage };
export type Edition = { cover: EditionImage | null; blocks: EditionBlock[] };

function secret() {
  return process.env.IMAGE_SIGNING_SECRET || process.env.MCP_SECRET || "";
}
export function imageSig(id: number) {
  return createHmac("sha256", secret()).update(`upload:${id}`).digest("base64url").slice(0, 32);
}
export function imageUrl(id: number) {
  return `${config.appUrl()}/img/${id}/${imageSig(id)}`;
}

/** Spreads the founder's images through the public answers: the first after the opening answer, the rest evenly. */
export async function buildEdition(interviewId: number, draft: Draft, analysis: string | null): Promise<Edition> {
  const rows = await db()`SELECT id, filename, kind FROM uploads WHERE interview_id = ${interviewId} ORDER BY id`;
  const toImg = (r: Record<string, unknown>): EditionImage => ({ id: r.id as number, filename: r.filename as string, url: imageUrl(r.id as number) });
  const shot = rows.find((r) => r.kind === "screenshot");
  const photos = rows.filter((r) => r.kind !== "screenshot").map(toImg);

  const { pub, deep, closing } = splitDraft(draft);
  const qa = (it: DraftItem): EditionBlock => ({ type: "qa", heading: it.heading, answer: it.answer });

  // Positions (after which public answer) for each photo.
  const after = new Map<number, EditionImage[]>();
  if (photos.length && pub.length) {
    const slots = Math.max(1, pub.length - 1);
    photos.forEach((ph, k) => {
      const pos = k === 0 ? 0 : Math.min(pub.length - 1, Math.round((k * slots) / photos.length));
      after.set(pos, [...(after.get(pos) ?? []), ph]);
    });
  }
  const blocks: EditionBlock[] = [];
  pub.forEach((it, idx) => {
    blocks.push(qa(it));
    for (const ph of after.get(idx) ?? []) blocks.push({ type: "image", image: ph });
  });
  if (!pub.length) for (const ph of photos) blocks.push({ type: "image", image: ph });
  if (deep.length || analysis) blocks.push({ type: "section", label: "Deep Dive" });
  deep.forEach((it) => blocks.push(qa(it)));
  if (analysis) blocks.push({ type: "qa", heading: "Analysis", answer: analysis });
  closing.forEach((it) => blocks.push(qa(it)));
  return { cover: shot ? toImg(shot) : null, blocks };
}
