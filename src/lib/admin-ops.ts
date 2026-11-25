// Admin operations shared by the web panel (server actions) and the MCP endpoint.
// Callers are responsible for authentication.
import { db } from "./db";
import { config } from "./config";
import { randomToken } from "./tokens";
import { generateDraft, getInterviewById, type Draft } from "./interview";
import { deleteObjects, MAX_UPLOAD_BYTES, putObject, sniffImage } from "./storage";
import type { Intro } from "./llm";
import { sendApprovalRequest, sendDraftForReview, sendInvitation, sendPublicationDate } from "./emails";

export type OpResult = { ok: boolean; message: string; id?: number };

export async function createInterviewOp(input: { founderName: string; founderEmail: string; company?: string | null; newsletter: string; send: boolean }): Promise<OpResult> {
  const founderName = input.founderName.trim();
  const founderEmail = input.founderEmail.trim().toLowerCase();
  const company = input.company?.trim() || null;
  if (!founderName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(founderEmail)) return { ok: false, message: "Name and a valid email are required." };
  const sql = db();
  const [qn] = await sql`
    SELECT q.id FROM questionnaires q JOIN newsletters n ON n.id = q.newsletter_id
    WHERE n.slug = ${input.newsletter} AND q.active ORDER BY q.id DESC LIMIT 1`;
  if (!qn) return { ok: false, message: `No active questionnaire for newsletter "${input.newsletter}".` };
  const [row] = await sql`
    INSERT INTO interviews (token, approval_token, questionnaire_id, founder_name, founder_email, company, invited_at)
    VALUES (${randomToken(18)}, ${randomToken(18)}, ${qn.id}, ${founderName}, ${founderEmail}, ${company}, ${input.send ? new Date() : null})
    RETURNING *`;
  if (input.send) {
    const r = await sendInvitation(row as never);
    if (!r.ok) return { ok: false, id: row.id, message: `The interview was created but the invitation email failed: ${r.error}` };
    return { ok: true, id: row.id, message: "Interview created and invitation sent." };
  }
  return { ok: true, id: row.id, message: "Interview created (no email sent)." };
}

export async function resendInvitationOp(id: number): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  if (!["invited", "in_progress"].includes(i.status)) return { ok: false, message: "The interview is already finished." };
  const r = await sendInvitation(i);
  if (r.ok) await db()`UPDATE interviews SET invited_at = now() WHERE id = ${id}`;
  return r.ok ? { ok: true, message: "Invitation sent." } : { ok: false, message: `Email failed: ${r.error}` };
}

export async function saveReviewOp(id: number, items: { questionId: number; heading?: string; answer?: string }[], analysis?: string | null): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft to save yet." };
  if (["approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "This interview is already approved and can't be edited." };
  const unknown = items.filter((x) => !i.draft!.items.some((it) => it.questionId === x.questionId));
  if (unknown.length) return { ok: false, message: `Unknown questionId(s): ${unknown.map((u) => u.questionId).join(", ")}.` };
  const draft: Draft = {
    ...i.draft,
    items: i.draft.items.map((it) => {
      const edit = items.find((x) => x.questionId === it.questionId);
      if (!edit) return it;
      return {
        ...it,
        heading: edit.heading !== undefined ? edit.heading.trim() || it.heading : it.heading,
        answer: edit.answer !== undefined ? edit.answer : it.answer,
      };
    }),
  };
  const nextAnalysis = analysis === undefined ? i.analysis : analysis?.trim() || null;
  const sql = db();
  await sql`UPDATE interviews SET draft = ${sql.json(draft as never)}, analysis = ${nextAnalysis}, updated_at = now() WHERE id = ${id}`;
  return { ok: true, message: "Saved." };
}

/** Places the founder's images: upload id -> questionId it follows, "none" to leave it out, or "auto". */
export async function savePhotoPlacementOp(id: number, placement: Record<string, number | "none" | "auto">): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft yet." };
  if (["approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "This interview is already approved and can't be edited." };
  const photos = await db()`SELECT id FROM uploads WHERE interview_id = ${id} AND kind <> 'screenshot'`;
  const photoIds = new Set(photos.map((p) => String(p.id)));
  const qIds = new Set(i.draft.items.map((it) => it.questionId));
  const next: Record<string, number | "none"> = { ...(i.draft.imagePlacement ?? {}) };
  for (const [k, v] of Object.entries(placement)) {
    if (!photoIds.has(String(k))) return { ok: false, message: `Image ${k} doesn't belong to this interview.` };
    if (v === "auto") delete next[k];
    else if (v === "none") next[k] = "none";
    else if (qIds.has(Number(v))) next[k] = Number(v);
    else return { ok: false, message: `Unknown questionId ${v}.` };
  }
  const draft: Draft = { ...i.draft, imagePlacement: next };
  const sql = db();
  await sql`UPDATE interviews SET draft = ${sql.json(draft as never)}, updated_at = now() WHERE id = ${id}`;
  return { ok: true, message: "Photos placed." };
}

export async function regenerateDraftOp(id: number): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i || !i.completed_at) return { ok: false, message: "The interview isn't finished yet." };
  if (["awaiting_approval", "approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "The draft was already sent to the founder." };
  await db()`UPDATE interviews SET draft_status = 'generating' WHERE id = ${id}`;
  await generateDraft(id);
  const after = await getInterviewById(id);
  return after?.draft_status === "ready" ? { ok: true, message: "Draft regenerated." } : { ok: false, message: "Draft generation failed; try again." };
}

export async function sendForApprovalOp(id: number): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft yet." };
  if (!["in_review", "awaiting_approval"].includes(i.status)) return { ok: false, message: "This interview can't be sent for approval now." };
  if (i.deep_skipped_count > 0 && !i.analysis?.trim()) {
    return { ok: false, message: "The founder skipped Deep Dive questions: write and save the analysis before sending." };
  }
  const r = await sendApprovalRequest(i);
  if (!r.ok) return { ok: false, message: `Email failed: ${r.error}` };
  await db()`UPDATE interviews SET status = 'awaiting_approval', sent_for_approval_at = now(), review_token = NULL, updated_at = now() WHERE id = ${id}`;
  return { ok: true, message: "Sent to the founder for approval." };
}

export async function setPublicationDateOp(id: number, date: string): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  if (!["approved", "scheduled"].includes(i.status)) return { ok: false, message: "The founder hasn't approved the interview yet." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Date must be YYYY-MM-DD." };
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const r = await sendPublicationDate(i, label);
  if (!r.ok) return { ok: false, message: `Email failed: ${r.error}` };
  await db()`UPDATE interviews SET publication_date = ${date}, status = 'scheduled', updated_at = now() WHERE id = ${id}`;
  return { ok: true, message: `Publication date sent: ${label}.` };
}

export async function setPublishedOp(id: number, published: boolean): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  if (published) {
    if (!["approved", "scheduled"].includes(i.status)) return { ok: false, message: "Only approved interviews can be marked as published." };
    await db()`UPDATE interviews SET status = 'published', published_at = now(), updated_at = now() WHERE id = ${id}`;
    return { ok: true, message: "Marked as published." };
  }
  if (i.status !== "published") return { ok: false, message: "It isn't marked as published." };
  await db()`UPDATE interviews SET status = CASE WHEN publication_date IS NULL THEN 'approved' ELSE 'scheduled' END, published_at = NULL, updated_at = now() WHERE id = ${id}`;
  return { ok: true, message: "Back in the publication queue." };
}

export async function deleteInterviewOp(id: number): Promise<OpResult> {
  const sql = db();
  const files = await sql`SELECT object_key FROM uploads WHERE interview_id = ${id}`;
  if (files.length) {
    try { await deleteObjects(files.map((f) => f.object_key as string)); }
    catch { return { ok: false, message: "The uploaded files could not be deleted. Nothing was removed; try again." }; }
  }
  const [row] = await sql`DELETE FROM interviews WHERE id = ${id} RETURNING id`;
  if (!row) return { ok: false, message: "Not found." };
  return { ok: true, message: "Interview deleted." };
}

export function interviewLinks(i: { token: string; approval_token: string; id: number }) {
  return {
    founderLink: `${config.appUrl()}/i/${i.token}`,
    approvalLink: `${config.appUrl()}/approve/${i.approval_token}`,
    adminLink: `${config.appUrl()}/admin/interviews/${i.id}`,
  };
}


/** Edits the intro: chosen title and subtitle, hook, snapshot, bullets, teaser, pull quote. */
export async function saveIntroOp(id: number, patch: Partial<Pick<Intro, "title" | "subtitle" | "hook" | "snapshot" | "teaser" | "pullQuote">> & { bullets?: string[] }): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft yet." };
  if (["approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "This interview is already approved and can't be edited." };
  const cur: Intro = i.draft.intro ?? { titles: [], title: "", subtitle: "", hook: "", bullets: [] };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  const next: Intro = {
    ...cur,
    title: str(patch.title) ?? cur.title,
    subtitle: str(patch.subtitle) ?? cur.subtitle,
    hook: str(patch.hook) ?? cur.hook,
    snapshot: patch.snapshot !== undefined ? str(patch.snapshot) || undefined : cur.snapshot,
    teaser: patch.teaser !== undefined ? str(patch.teaser) || undefined : cur.teaser,
    pullQuote: patch.pullQuote !== undefined ? str(patch.pullQuote) || undefined : cur.pullQuote,
    bullets: patch.bullets ? cur.bullets.map((b, k) => ({ ...b, text: String(patch.bullets![k] ?? b.text).trim() })) : cur.bullets,
  };
  if (!next.title) return { ok: false, message: "The title can't be empty." };
  const draft: Draft = { ...i.draft, intro: next };
  const sql = db();
  await sql`UPDATE interviews SET draft = ${sql.json(draft as never)}, updated_at = now() WHERE id = ${id}`;
  return { ok: true, message: "Intro saved." };
}

export async function resolveChangeRequestOp(id: number, requestId: number): Promise<OpResult> {
  const [r] = await db()`UPDATE change_requests SET resolved_at = now() WHERE id = ${requestId} AND interview_id = ${id} RETURNING id`;
  return r ? { ok: true, message: "Marked as done." } : { ok: false, message: "Request not found." };
}

/** An image the founder sent by email, added by an admin; it goes into the edition like the founder's own. */
export async function addAdminImageOp(id: number, file: { name: string; bytes: Uint8Array; size: number }): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  if (["approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "This interview is already approved." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "Images can be up to 10 MB." };
  const type = sniffImage(file.bytes);
  if (!type) return { ok: false, message: "That file isn't a PNG, JPG, WebP or GIF image." };
  const [{ n }] = await db()`SELECT count(*)::int AS n FROM uploads WHERE interview_id = ${id} AND kind = 'founder'`;
  if (n >= 20) return { ok: false, message: "This interview already has 20 images." };
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "image";
  const key = `interviews/${id}/${randomToken(8)}-${safeName}`;
  await putObject(key, file.bytes, type);
  await db()`INSERT INTO uploads (interview_id, object_key, filename, content_type, size_bytes) VALUES (${id}, ${key}, ${safeName}, ${type}, ${file.size})`;
  return { ok: true, message: "Image added." };
}

/** Emails the current edition to the admins again (no regeneration), with a fresh one-click approve link. */
export async function sendReviewEmailOp(id: number): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft yet." };
  if (!["completed", "in_review"].includes(i.status)) return { ok: false, message: "Only drafts not yet sent to the founder can be emailed for review." };
  const reviewToken = randomToken(18);
  await db()`UPDATE interviews SET review_token = ${reviewToken} WHERE id = ${id}`;
  const r = await sendDraftForReview({ ...i, review_token: reviewToken, draft: i.draft });
  return r.ok ? { ok: true, message: "Review email sent to the admins." } : { ok: false, message: `Email failed: ${r.error}` };
}

/** Adds an answer the founder gave outside the interview, right after another item of the draft. */
export async function insertDraftItemOp(id: number, afterQuestionId: number, item: { heading: string; answer: string; questionId?: number }): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft yet." };
  if (["approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "This interview is already approved and can't be edited." };
  const at = i.draft.items.findIndex((it) => it.questionId === afterQuestionId);
  if (at < 0) return { ok: false, message: `Unknown questionId ${afterQuestionId}.` };
  if (!item.heading.trim() || !item.answer.trim()) return { ok: false, message: "Heading and answer are required." };
  const prev = i.draft.items[at];
  const questionId = item.questionId ?? -Math.floor(Date.now() / 1000);
  if (i.draft.items.some((it) => it.questionId === questionId)) return { ok: false, message: "That questionId is already in the draft." };
  const items = [...i.draft.items];
  items.splice(at + 1, 0, { questionId, layer: prev.layer, section: prev.section, original: item.heading.trim(), heading: item.heading.trim(), answer: item.answer.trim(), notes: ["Added by the editor from an answer given outside the interview"] });
  const draft: Draft = { ...i.draft, items };
  const sql = db();
  await sql`UPDATE interviews SET draft = ${sql.json(draft as never)}, updated_at = now() WHERE id = ${id}`;
  return { ok: true, message: `Added after question ${afterQuestionId} (questionId ${questionId}).` };
}

/** The founder replied "OK" to the approval email: record the approval with the same terms as the approval page. */
export async function approveByEmailOp(id: number): Promise<OpResult> {
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  if (i.status !== "awaiting_approval") return { ok: false, message: "This interview is not awaiting approval." };
  const [qn] = await db()`SELECT rights_clause FROM questionnaires WHERE id = ${i.questionnaire_id}`;
  await db()`
    UPDATE interviews SET status = 'approved', approved_at = now(), approval_clause = ${qn.rights_clause},
      approval_email = ${`${i.founder_email} (replied OK by email)`}, updated_at = now()
    WHERE id = ${id} AND status = 'awaiting_approval'`;
  return { ok: true, message: "Marked as approved (the founder replied OK by email)." };
}
