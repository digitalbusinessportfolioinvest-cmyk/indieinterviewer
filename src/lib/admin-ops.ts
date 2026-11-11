// Admin operations shared by the web panel (server actions) and the MCP endpoint.
// Callers are responsible for authentication.
import { db } from "./db";
import { config } from "./config";
import { randomToken } from "./tokens";
import { generateDraft, getInterviewById, type Draft } from "./interview";
import { deleteObjects } from "./storage";
import { sendApprovalRequest, sendInvitation, sendPublicationDate } from "./emails";

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
  await db()`UPDATE interviews SET status = 'awaiting_approval', sent_for_approval_at = now(), updated_at = now() WHERE id = ${id}`;
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
