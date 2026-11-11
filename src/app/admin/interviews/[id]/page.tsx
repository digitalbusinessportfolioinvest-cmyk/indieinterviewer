import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { getAnswers, getInterviewById, getQuestions } from "@/lib/interview";
import { signedGetUrl } from "@/lib/storage";
import { STATUS_LABELS } from "@/lib/status";
import { draftToMarkdown } from "@/components/ArticleView";
import AdminHeader from "../../AdminHeader";
import ReviewEditor from "./ReviewEditor";
import { ActionButton, DeleteInterview, PublicationDateForm, PublishedToggle, ScreenshotForm } from "./Controls";

export const dynamic = "force-dynamic";

export default async function InterviewDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const email = await requireAdmin();
  const { id: idParam } = await params;
  const { notice } = await searchParams;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const i = await getInterviewById(id);
  if (!i) notFound();

  const [questions, answers, uploadRows] = await Promise.all([
    getQuestions(i.questionnaire_id),
    getAnswers(i.id),
    db()`SELECT id, object_key, filename, content_type, size_bytes, kind FROM uploads WHERE interview_id = ${i.id} ORDER BY id`,
  ]);
  const uploads = await Promise.all(
    uploadRows.map(async (u) => {
      let url: string | null = null;
      try { url = await signedGetUrl(u.object_key, u.filename); } catch { url = null; }
      return { id: u.id as number, filename: u.filename as string, size: u.size_bytes as number, kind: u.kind as string, url };
    }),
  );

  const interviewUrl = `${config.appUrl()}/i/${i.token}`;
  const approvalUrl = `${config.appUrl()}/approve/${i.approval_token}`;
  const answeredCount = questions.filter((q) => q.position < i.current_position).length;
  const editable = ["completed", "in_review", "awaiting_approval"].includes(i.status);
  const rawDate = i.publication_date as unknown;
  const pubDate = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : rawDate ? String(rawDate).slice(0, 10) : "";

  return (
    <main className="wrap wide">
      <AdminHeader email={email} />
      <p className="small"><a href="/admin">← All interviews</a></p>

      <div className="card">
        <div className="row">
          <h1 style={{ margin: 0 }}>{i.founder_name}</h1>
          <span className="pill">{STATUS_LABELS[i.status] ?? i.status}</span>
          {i.deep_skipped_count > 0 && i.completed_at && <span className="pill">Skipped {i.deep_skipped_count} Deep Dive</span>}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{i.founder_email}{i.company ? ` · ${i.company}` : ""}</p>
        {notice === "invite_failed" && <p className="error">The interview was created but the invitation email failed. Use the link below or try sending again.</p>}
        <label>Interview link for the founder</label>
        <input type="text" readOnly value={interviewUrl} />
        {["invited", "in_progress"].includes(i.status) && (
          <div style={{ marginTop: 12 }}><ActionButton kind="invite" id={i.id} label="Send invitation email" /></div>
        )}
        {i.status === "in_progress" && <p className="muted small" style={{ marginTop: 12 }}>Answered {answeredCount} of {questions.length} questions.</p>}
      </div>

      {(i.status === "in_progress" || i.status === "invited") && answers.length > 0 && (
        <div className="card">
          <h2>Answers so far</h2>
          {answers.map((a) => (
            <div key={a.question_id} style={{ marginBottom: 16 }}>
              <h3>{a.prompt}</h3>
              <p className="pre">{a.skipped ? <span className="muted">Skipped</span> : a.text}</p>
            </div>
          ))}
        </div>
      )}

      {i.completed_at && (() => {
        const shotFile = uploads.find((u) => u.kind === "screenshot");
        return (
          <div className="card">
            <h2>Homepage screenshot</h2>
            {shotFile?.url ? (
              <a href={shotFile.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shotFile.url} alt="Homepage screenshot" style={{ width: "100%", maxWidth: 720, border: "1px solid var(--line)", borderRadius: 8 }} />
              </a>
            ) : i.screenshot_error ? (
              <p className="error">{i.screenshot_error}</p>
            ) : (
              <p className="muted small">Being taken. Reload in a minute.</p>
            )}
            <div style={{ marginTop: 12 }}><ScreenshotForm id={i.id} current={i.homepage_url ?? ""} /></div>
          </div>
        );
      })()}

      {uploads.some((u) => u.kind !== "screenshot") && (
        <div className="card">
          <h2>Files from the founder</h2>
          <ul>
            {uploads.filter((u) => u.kind !== "screenshot").map((u) => (
              <li key={u.id}>{u.url ? <a href={u.url} target="_blank" rel="noreferrer">{u.filename}</a> : u.filename} <span className="muted small">({Math.ceil(u.size / 1024)} KB)</span></li>
            ))}
          </ul>
        </div>
      )}

      {i.completed_at && i.draft_status === "generating" && (
        <div className="card"><p>The draft is being generated. Reload in a minute.</p></div>
      )}

      {i.completed_at && i.draft_status === "failed" && (
        <div className="card">
          <p className="error">The question headings could not be rewritten automatically, so the draft uses the original questions.</p>
          {editable && <ActionButton kind="regenerate" id={i.id} label="Try again" />}
        </div>
      )}

      {i.draft && (
        <ReviewEditor
          id={i.id}
          items={i.draft.items}
          analysis={i.analysis ?? ""}
          needsAnalysis={i.deep_skipped_count > 0}
          editable={editable}
          markdown={draftToMarkdown(i.draft, i.analysis)}
          status={i.status}
          canRegenerate={editable && i.status !== "awaiting_approval"}
        />
      )}

      {i.status === "awaiting_approval" && (
        <div className="card">
          <h2>Awaiting approval</h2>
          <p className="small muted">Approval page sent to the founder:</p>
          <input type="text" readOnly value={approvalUrl} />
        </div>
      )}

      {i.approved_at && (
        <div className="card">
          <h2>Approval</h2>
          <p>Approved on {new Date(i.approved_at).toUTCString()} by {i.approval_email}.</p>
          <p className="small muted">Accepted text:</p>
          <div className="clause">{i.approval_clause}</div>
        </div>
      )}

      {["approved", "scheduled"].includes(i.status) && (
        <div className="card">
          <h2>Publication date</h2>
          {pubDate && <p>Sent to the founder: {pubDate}</p>}
          <PublicationDateForm id={i.id} current={pubDate} />
          <div style={{ marginTop: 16 }}><PublishedToggle id={i.id} published={false} /></div>
        </div>
      )}

      {i.status === "published" && (
        <div className="card">
          <h2>Published</h2>
          <p>Marked as published{i.published_at ? ` on ${new Date(i.published_at).toLocaleDateString("en-GB")}` : ""}.</p>
          <PublishedToggle id={i.id} published />
        </div>
      )}

      <div className="card">
        <h2>Delete</h2>
        <p className="small muted">Removes the interview, its answers, messages and uploaded files. This can't be undone.</p>
        <DeleteInterview id={i.id} name={i.founder_name} />
      </div>
    </main>
  );
}
