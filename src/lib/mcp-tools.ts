// Tool definitions for the admin MCP endpoint.
import { db } from "./db";
import { getAnswers, getInterviewById, getQuestions } from "./interview";
import { signedGetUrl } from "./storage";
import { STATUS_LABELS } from "./status";
import { draftToMarkdown } from "@/components/ArticleView";
import {
  createInterviewOp, deleteInterviewOp, interviewLinks, regenerateDraftOp, resendInvitationOp,
  saveReviewOp, sendForApprovalOp, setPublicationDateOp, setPublishedOp,
} from "./admin-ops";

type Args = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  run: (args: Args) => Promise<unknown>;
};

const id = { type: "integer", description: "Interview id (from list_interviews)." };
const num = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("id must be an integer");
  return n;
};
const dateStr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);

export const tools: Tool[] = [
  {
    name: "list_newsletters",
    description: "List the publications interviews can be created for (slug and name).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => db()`SELECT slug, name, publisher, website FROM newsletters ORDER BY id`,
  },
  {
    name: "list_interviews",
    description: `List interviews, newest first. Statuses: ${Object.keys(STATUS_LABELS).join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Only this status." },
        newsletter: { type: "string", description: "Only this newsletter slug." },
        limit: { type: "integer", description: "Max rows (default 100)." },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const sql = db();
      const status = a.status ? String(a.status) : null;
      const nl = a.newsletter ? String(a.newsletter) : null;
      const limit = Math.min(Number(a.limit) || 100, 500);
      const rows = await sql`
        SELECT i.id, i.founder_name, i.founder_email, i.company, i.status, i.deep_skipped_count,
               i.created_at, i.invited_at, i.completed_at, i.approved_at, i.publication_date, i.published_at,
               n.slug AS newsletter
        FROM interviews i JOIN questionnaires q ON q.id = i.questionnaire_id JOIN newsletters n ON n.id = q.newsletter_id
        WHERE (${status}::text IS NULL OR i.status = ${status}) AND (${nl}::text IS NULL OR n.slug = ${nl})
        ORDER BY i.created_at DESC LIMIT ${limit}`;
      return rows.map((r) => ({ ...r, publication_date: dateStr(r.publication_date) }));
    },
  },
  {
    name: "publication_queue",
    description: "Approved interviews waiting to be published, grouped by newsletter and ordered by publication date (undated last).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => {
      const rows = await db()`
        SELECT i.id, i.founder_name, i.company, i.status, i.publication_date, n.slug AS newsletter
        FROM interviews i JOIN questionnaires q ON q.id = i.questionnaire_id JOIN newsletters n ON n.id = q.newsletter_id
        WHERE i.status IN ('approved', 'scheduled')
        ORDER BY n.id, i.publication_date NULLS LAST, i.approved_at NULLS LAST, i.id`;
      const out: Record<string, unknown[]> = {};
      for (const r of rows) (out[r.newsletter] ??= []).push({ ...r, publication_date: dateStr(r.publication_date) });
      return out;
    },
  },
  {
    name: "get_interview",
    description: "Full detail of one interview: status, links, every question with the founder's answer, the draft (with questionId per item, for update_draft), the analysis, the draft as Markdown, and uploaded images with temporary download links.",
    inputSchema: { type: "object", properties: { id }, required: ["id"] },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const i = await getInterviewById(num(a.id));
      if (!i) throw new Error("Interview not found.");
      const [questions, answers, uploads, [nl]] = await Promise.all([
        getQuestions(i.questionnaire_id),
        getAnswers(i.id),
        db()`SELECT object_key, filename, content_type, size_bytes FROM uploads WHERE interview_id = ${i.id} ORDER BY id`,
        db()`SELECT n.slug FROM newsletters n JOIN questionnaires q ON q.newsletter_id = n.id WHERE q.id = ${i.questionnaire_id}`,
      ]);
      const byQ = new Map(answers.map((x) => [x.question_id, x]));
      return {
        id: i.id, newsletter: nl?.slug, founder_name: i.founder_name, founder_email: i.founder_email, company: i.company,
        status: i.status, deep_skipped_count: i.deep_skipped_count, draft_status: i.draft_status,
        completed_at: i.completed_at, approved_at: i.approved_at,
        publication_date: dateStr(i.publication_date), published_at: i.published_at,
        ...interviewLinks(i),
        answers: questions.map((q) => {
          const ans = byQ.get(q.id);
          return { questionId: q.id, layer: q.layer, section: q.section, prompt: q.prompt, answer: ans?.skipped ? null : ans?.text ?? null, skipped: ans?.skipped ?? false };
        }),
        draft: i.draft,
        analysis: i.analysis,
        draft_markdown: i.draft ? draftToMarkdown(i.draft, i.analysis) : null,
        uploads: await Promise.all(uploads.map(async (u) => ({
          filename: u.filename, content_type: u.content_type, size_bytes: u.size_bytes,
          url: await signedGetUrl(u.object_key, u.filename).catch(() => null),
        }))),
      };
    },
  },
  {
    name: "create_interview",
    description: "Create an interview for a founder who has agreed by email. With send_invitation true (default) the founder immediately receives the invitation email with their personal link, branded for the chosen newsletter.",
    inputSchema: {
      type: "object",
      properties: {
        founder_name: { type: "string" },
        founder_email: { type: "string" },
        company: { type: "string" },
        newsletter: { type: "string", description: "Newsletter slug from list_newsletters, e.g. indie-hustle or founders-struggles." },
        send_invitation: { type: "boolean", description: "Default true." },
      },
      required: ["founder_name", "founder_email", "newsletter"],
    },
    run: async (a) => {
      const r = await createInterviewOp({
        founderName: String(a.founder_name ?? ""), founderEmail: String(a.founder_email ?? ""),
        company: a.company ? String(a.company) : null, newsletter: String(a.newsletter ?? ""),
        send: a.send_invitation !== false,
      });
      if (!r.id) return r;
      const i = await getInterviewById(r.id);
      return { ...r, ...(i ? interviewLinks(i) : {}) };
    },
  },
  {
    name: "resend_invitation",
    description: "Send the invitation email again (only while the interview is not finished).",
    inputSchema: { type: "object", properties: { id }, required: ["id"] },
    run: async (a) => resendInvitationOp(num(a.id)),
  },
  {
    name: "update_draft",
    description: "Edit the draft before approval: rewrite headings and/or answers (by questionId from get_interview's draft.items) and/or set the analysis (required before send_for_approval when Deep Dive questions were skipped). Fields left out are not changed.",
    inputSchema: {
      type: "object",
      properties: {
        id,
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { questionId: { type: "integer" }, heading: { type: "string" }, answer: { type: "string" } },
            required: ["questionId"],
          },
        },
        analysis: { type: "string", description: "Full analysis text. Empty string clears it." },
      },
      required: ["id"],
    },
    run: async (a) => {
      const items = Array.isArray(a.items) ? (a.items as Args[]).map((x) => ({
        questionId: num(x.questionId),
        heading: x.heading === undefined ? undefined : String(x.heading),
        answer: x.answer === undefined ? undefined : String(x.answer),
      })) : [];
      return saveReviewOp(num(a.id), items, a.analysis === undefined ? undefined : String(a.analysis));
    },
  },
  {
    name: "regenerate_draft",
    description: "Regenerate the draft (headings rewritten by the model) for a finished interview that hasn't been sent for approval. Overwrites manual edits.",
    inputSchema: { type: "object", properties: { id }, required: ["id"] },
    run: async (a) => regenerateDraftOp(num(a.id)),
  },
  {
    name: "send_for_approval",
    description: "Email the founder the link to read and approve the interview.",
    inputSchema: { type: "object", properties: { id }, required: ["id"] },
    run: async (a) => sendForApprovalOp(num(a.id)),
  },
  {
    name: "set_publication_date",
    description: "Set the publication date of an approved interview and email it to the founder.",
    inputSchema: { type: "object", properties: { id, date: { type: "string", description: "YYYY-MM-DD" } }, required: ["id", "date"] },
    run: async (a) => setPublicationDateOp(num(a.id), String(a.date ?? "")),
  },
  {
    name: "set_published",
    description: "Mark an approved interview as published (published: true) or put it back in the queue (published: false).",
    inputSchema: { type: "object", properties: { id, published: { type: "boolean" } }, required: ["id", "published"] },
    run: async (a) => setPublishedOp(num(a.id), a.published !== false),
  },
  {
    name: "delete_interview",
    description: "Permanently delete an interview with its answers, messages and uploaded files. Requires confirm: true.",
    inputSchema: { type: "object", properties: { id, confirm: { type: "boolean" } }, required: ["id", "confirm"] },
    annotations: { destructiveHint: true },
    run: async (a) => {
      if (a.confirm !== true) return { ok: false, message: "Not deleted: pass confirm: true." };
      return deleteInterviewOp(num(a.id));
    },
  },
];
