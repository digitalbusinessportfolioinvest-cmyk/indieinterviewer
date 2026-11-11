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

export type PhotoPlacement = EditionImage & { after: number | "none"; auto: boolean };

/** Builds the edition. Images follow the manual placement saved in the draft; otherwise the first goes after
 *  the opening answer and the rest are spread evenly through the public answers. */
export async function buildEdition(interviewId: number, draft: Draft, analysis: string | null): Promise<Edition & { photos: PhotoPlacement[] }> {
  const rows = await db()`SELECT id, filename, kind FROM uploads WHERE interview_id = ${interviewId} ORDER BY id`;
  const toImg = (r: Record<string, unknown>): EditionImage => ({ id: r.id as number, filename: r.filename as string, url: imageUrl(r.id as number) });
  const shot = rows.find((r) => r.kind === "screenshot");
  const photoImgs = rows.filter((r) => r.kind !== "screenshot").map(toImg);

  const { pub, deep, closing } = splitDraft(draft);
  const validIds = new Set(draft.items.map((it) => it.questionId));
  const manual = draft.imagePlacement ?? {};

  // Automatic slots for images without a manual placement.
  const autoTargets = photoImgs.filter((ph) => manual[String(ph.id)] === undefined);
  const autoAfter = new Map<number, number>();
  if (pub.length) {
    const slots = Math.max(1, pub.length - 1);
    autoTargets.forEach((ph, k) => {
      const pos = k === 0 ? 0 : Math.min(pub.length - 1, Math.round((k * slots) / autoTargets.length));
      autoAfter.set(ph.id, pub[pos].questionId);
    });
  }
  const photos: PhotoPlacement[] = photoImgs.map((ph) => {
    const m = manual[String(ph.id)];
    if (m === "none") return { ...ph, after: "none", auto: false };
    if (typeof m === "number" && validIds.has(m)) return { ...ph, after: m, auto: false };
    return { ...ph, after: autoAfter.get(ph.id) ?? "none", auto: true };
  });
  const byQ = new Map<number, EditionImage[]>();
  for (const ph of photos) if (ph.after !== "none") byQ.set(ph.after, [...(byQ.get(ph.after) ?? []), ph]);

  const blocks: EditionBlock[] = [];
  const push = (it: DraftItem) => {
    blocks.push({ type: "qa", heading: it.heading, answer: it.answer });
    for (const ph of byQ.get(it.questionId) ?? []) blocks.push({ type: "image", image: { id: ph.id, filename: ph.filename, url: ph.url } });
  };
  pub.forEach(push);
  if (deep.length || analysis) blocks.push({ type: "section", label: "Deep Dive" });
  deep.forEach(push);
  if (analysis) blocks.push({ type: "qa", heading: "Analysis", answer: analysis });
  closing.forEach(push);
  return { cover: shot ? toImg(shot) : null, blocks, photos };
}
