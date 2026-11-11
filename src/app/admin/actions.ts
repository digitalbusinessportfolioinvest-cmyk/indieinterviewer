"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  savePhotoPlacementOp,
  createInterviewOp, deleteInterviewOp, regenerateDraftOp, resendInvitationOp, saveReviewOp,
  sendForApprovalOp, setPublicationDateOp, setPublishedOp,
} from "@/lib/admin-ops";
import { takeHomepageScreenshot } from "@/lib/screenshot";

export type ActionResult = { ok: boolean; message: string };

export async function createInterview(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const r = await createInterviewOp({
    founderName: String(form.get("founder_name") ?? ""),
    founderEmail: String(form.get("founder_email") ?? ""),
    company: String(form.get("company") ?? ""),
    newsletter: String(form.get("newsletter") ?? "indie-hustle"),
    send: form.get("send_email") === "on",
  });
  revalidatePath("/admin");
  if (!r.id) return { ok: false, message: r.message };
  redirect(r.ok ? `/admin/interviews/${r.id}` : `/admin/interviews/${r.id}?notice=invite_failed`);
}

export async function resendInvitation(id: number): Promise<ActionResult> {
  await requireAdmin();
  const r = await resendInvitationOp(id);
  revalidatePath(`/admin/interviews/${id}`);
  return r;
}

export async function saveReview(id: number, items: { questionId: number; heading: string; answer: string }[], analysis: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await saveReviewOp(id, items, analysis);
  revalidatePath(`/admin/interviews/${id}`);
  return r;
}

export async function savePhotoPlacement(id: number, placement: Record<string, number | "none" | "auto">): Promise<ActionResult> {
  await requireAdmin();
  const r = await savePhotoPlacementOp(id, placement);
  revalidatePath(`/admin/interviews/${id}`);
  return r;
}

export async function regenerateDraft(id: number): Promise<ActionResult> {
  await requireAdmin();
  const r = await regenerateDraftOp(id);
  revalidatePath(`/admin/interviews/${id}`);
  return r;
}

export async function sendForApproval(id: number): Promise<ActionResult> {
  await requireAdmin();
  const r = await sendForApprovalOp(id);
  revalidatePath(`/admin/interviews/${id}`);
  return r;
}

export async function setPublicationDate(id: number, date: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await setPublicationDateOp(id, date);
  revalidatePath(`/admin/interviews/${id}`);
  return r;
}

export async function setPublished(id: number, published: boolean): Promise<ActionResult> {
  await requireAdmin();
  const r = await setPublishedOp(id, published);
  revalidatePath(`/admin/interviews/${id}`);
  revalidatePath("/admin");
  return r;
}

export async function deleteInterview(id: number): Promise<ActionResult> {
  await requireAdmin();
  const r = await deleteInterviewOp(id);
  if (!r.ok) return r;
  revalidatePath("/admin");
  redirect("/admin?notice=deleted");
}

export async function retakeScreenshot(id: number, url: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await takeHomepageScreenshot(id, url || null);
  revalidatePath(`/admin/interviews/${id}`);
  return r;
}
