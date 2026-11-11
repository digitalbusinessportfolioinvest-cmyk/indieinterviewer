"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/tokens";
import { generateDraft, getInterviewById, type Draft } from "@/lib/interview";
import { deleteObjects } from "@/lib/storage";
import { sendApprovalRequest, sendInvitation, sendPublicationDate } from "@/lib/emails";

export type ActionResult = { ok: boolean; message: string };

export async function createInterview(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const founderName = String(form.get("founder_name") ?? "").trim();
  const founderEmail = String(form.get("founder_email") ?? "").trim().toLowerCase();
  const company = String(form.get("company") ?? "").trim() || null;
  const newsletter = String(form.get("newsletter") ?? "indie-hustle");
  const send = form.get("send_email") === "on";
  if (!founderName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(founderEmail)) {
    return { ok: false, message: "Name and a valid email are required." };
  }
  const sql = db();
  const [qn] = await sql`
    SELECT q.id FROM questionnaires q JOIN newsletters n ON n.id = q.newsletter_id
    WHERE n.slug = ${newsletter} AND q.active ORDER BY q.id DESC LIMIT 1`;
  if (!qn) return { ok: false, message: "No active questionnaire for that newsletter." };
  const [row] = await sql`
    INSERT INTO interviews (token, approval_token, questionnaire_id, founder_name, founder_email, company, invited_at)
    VALUES (${randomToken(18)}, ${randomToken(18)}, ${qn.id}, ${founderName}, ${founderEmail}, ${company}, ${send ? new Date() : null})
    RETURNING *`;
  if (send) {
    const r = await sendInvitation(row as never);
    if (!r.ok) {
      revalidatePath("/admin");
      redirect(`/admin/interviews/${row.id}?notice=invite_failed`);
    }
  }
  revalidatePath("/admin");
  redirect(`/admin/interviews/${row.id}`);
}

export async function resendInvitation(id: number): Promise<ActionResult> {
  await requireAdmin();
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  const r = await sendInvitation(i);
  if (r.ok) await db()`UPDATE interviews SET invited_at = now() WHERE id = ${id}`;
  revalidatePath(`/admin/interviews/${id}`);
  return r.ok ? { ok: true, message: "Invitation sent." } : { ok: false, message: `Email failed: ${r.error}` };
}

export async function saveReview(id: number, items: { questionId: number; heading: string; answer: string }[], analysis: string): Promise<ActionResult> {
  await requireAdmin();
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft to save yet." };
  if (["approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "This interview is already approved and can't be edited." };
  const draft: Draft = {
    ...i.draft,
    items: i.draft.items.map((it) => {
      const edit = items.find((x) => x.questionId === it.questionId);
      return edit ? { ...it, heading: edit.heading.trim() || it.heading, answer: edit.answer } : it;
    }),
  };
  const sql = db();
  await sql`UPDATE interviews SET draft = ${sql.json(draft as never)}, analysis = ${analysis.trim() || null}, updated_at = now() WHERE id = ${id}`;
  revalidatePath(`/admin/interviews/${id}`);
  return { ok: true, message: "Saved." };
}

export async function regenerateDraft(id: number): Promise<ActionResult> {
  await requireAdmin();
  const i = await getInterviewById(id);
  if (!i || !i.completed_at) return { ok: false, message: "The interview isn't finished yet." };
  if (["awaiting_approval", "approved", "scheduled", "published"].includes(i.status)) return { ok: false, message: "The draft was already sent to the founder." };
  await db()`UPDATE interviews SET draft_status = 'generating' WHERE id = ${id}`;
  await generateDraft(id);
  revalidatePath(`/admin/interviews/${id}`);
  return { ok: true, message: "Draft regenerated." };
}

export async function sendForApproval(id: number): Promise<ActionResult> {
  await requireAdmin();
  const i = await getInterviewById(id);
  if (!i || !i.draft) return { ok: false, message: "There is no draft yet." };
  if (!["in_review", "awaiting_approval"].includes(i.status)) return { ok: false, message: "This interview can't be sent for approval now." };
  if (i.deep_skipped_count > 0 && !i.analysis?.trim()) {
    return { ok: false, message: "The founder skipped Deep Dive questions: write and save the analysis before sending." };
  }
  const r = await sendApprovalRequest(i);
  if (!r.ok) return { ok: false, message: `Email failed: ${r.error}` };
  await db()`UPDATE interviews SET status = 'awaiting_approval', sent_for_approval_at = now(), updated_at = now() WHERE id = ${id}`;
  revalidatePath(`/admin/interviews/${id}`);
  return { ok: true, message: "Sent to the founder for approval." };
}

export async function setPublicationDate(id: number, date: string): Promise<ActionResult> {
  await requireAdmin();
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  if (!["approved", "scheduled"].includes(i.status)) return { ok: false, message: "The founder hasn't approved the interview yet." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Pick a date." };
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const r = await sendPublicationDate(i, label);
  if (!r.ok) return { ok: false, message: `Email failed: ${r.error}` };
  await db()`UPDATE interviews SET publication_date = ${date}, status = 'scheduled', updated_at = now() WHERE id = ${id}`;
  revalidatePath(`/admin/interviews/${id}`);
  return { ok: true, message: `Publication date sent: ${label}.` };
}

export async function setPublished(id: number, published: boolean): Promise<ActionResult> {
  await requireAdmin();
  const i = await getInterviewById(id);
  if (!i) return { ok: false, message: "Not found." };
  if (published) {
    if (!["approved", "scheduled"].includes(i.status)) return { ok: false, message: "Only approved interviews can be marked as published." };
    await db()`UPDATE interviews SET status = 'published', published_at = now(), updated_at = now() WHERE id = ${id}`;
  } else {
    if (i.status !== "published") return { ok: false, message: "It isn't marked as published." };
    await db()`UPDATE interviews SET status = CASE WHEN publication_date IS NULL THEN 'approved' ELSE 'scheduled' END, published_at = NULL, updated_at = now() WHERE id = ${id}`;
  }
  revalidatePath(`/admin/interviews/${id}`);
  revalidatePath("/admin");
  return { ok: true, message: published ? "Marked as published." : "Back in the publication queue." };
}

export async function deleteInterview(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = db();
  const files = await sql`SELECT object_key FROM uploads WHERE interview_id = ${id}`;
  if (files.length) {
    try { await deleteObjects(files.map((f) => f.object_key as string)); }
    catch { return { ok: false, message: "The uploaded files could not be deleted. Nothing was removed; try again." }; }
  }
  const [row] = await sql`DELETE FROM interviews WHERE id = ${id} RETURNING id`;
  if (!row) return { ok: false, message: "Not found." };
  revalidatePath("/admin");
  redirect("/admin?notice=deleted");
}
