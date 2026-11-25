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
import PhotoPlacer from "./PhotoPlacer";
import EditionView from "@/components/EditionView";
import { buildEdition, editionToMarkdown } from "@/lib/edition";
import { AdminImageUpload, IntroEditor, ResolveRequest } from "./Extras";
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

  const edition = i.draft ? await buildEdition(i.id, i.draft, i.analysis) : null;
  const changeRequests = await db()`SELECT id, heading, text, created_at, resolved_at FROM change_requests WHERE interview_id = ${i.id} ORDER BY id`;
  const checklist: { title: string; lines: string[] }[] = [];
  if (i.draft) {
    const d = i.draft;
    if (d.pending?.length) checklist.push({ title: "Pending from the founder", lines: d.pending });
    if (d.gaps?.length) checklist.push({ title: "Gaps to fill or check", lines: d.gaps });
    const broken = (d.links ?? []).filter((l) => !l.ok);
    if (broken.length) checklist.push({ title: "Links that didn't load", lines: broken.map((l) => `${l.url} (${l.status})`) });
    if (d.dropped?.length) checklist.push({ title: "Answers left out", lines: d.dropped.map((x) => `${x.heading}: ${x.reason}`) });
    if (d.polishNotes?.length) checklist.push({ title: "Final review pass", lines: d.polishNotes });
  }

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
          <p className="error">The edition could not be prepared (the editing steps failed, for example because OpenRouter ran out of credits). What you see below is the raw text. Regenerate once the problem is fixed.</p>
          {editable && <ActionButton kind="regenerate" id={i.id} label="Try again" />}
        </div>
      )}

      {changeRequests.length > 0 && (
        <div className="card">
          <h2>Changes requested by the founder</h2>
          {changeRequests.map((r) => (
            <div key={r.id} className="photo-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <p className="small muted" style={{ margin: 0 }}>{r.heading || "General"} · {new Date(r.created_at).toUTCString()}</p>
                <p className="pre" style={{ margin: "4px 0 0" }}>{r.text}</p>
              </div>
              {r.resolved_at ? <span className="small muted">Done</span> : <ResolveRequest id={i.id} requestId={r.id} />}
            </div>
          ))}
          <p className="small muted">Edit the draft below, then send it for approval again: the founder gets the updated edition.</p>
        </div>
      )}

      {checklist.length > 0 && (
        <div className="card">
          <h2>Editor&apos;s checklist</h2>
          {checklist.map((c) => (
            <div key={c.title}>
              <p style={{ margin: "12px 0 4px", fontWeight: 600 }}>{c.title}</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{c.lines.map((l, k) => <li key={k} className="small">{l}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      {i.draft?.intro && <IntroEditor key={i.draft.generatedAt} id={i.id} intro={i.draft.intro} editable={editable} />}

      {i.draft && (
        <ReviewEditor
          id={i.id}
          items={i.draft.items}
          analysis={i.analysis ?? ""}
          needsAnalysis={i.deep_skipped_count > 0}
          editable={editable}
          markdown={edition ? editionToMarkdown(edition) : draftToMarkdown(i.draft, i.analysis)}
          status={i.status}
          canRegenerate={editable && i.status !== "awaiting_approval"}
        />
      )}

      {i.draft && editable && <AdminImageUpload id={i.id} />}

      {i.draft && edition && edition.photos.length > 0 && (
        <PhotoPlacer
          key={JSON.stringify(i.draft.imagePlacement ?? {})}
          id={i.id}
          photos={edition.photos}
          options={i.draft.items.map((it) => ({ questionId: it.questionId, heading: it.heading }))}
          editable={editable}
        />
      )}

      {edition && (
        <details className="card">
          <summary><strong>Preview the edition</strong> <span className="small muted">(what the founder sees)</span></summary>
          <EditionView edition={edition} />
        </details>
      )}

      {i.status === "awaiting_approval" && (
        <div className="card">
          <h2>Awaiting approval</h2>
          <p className="small muted">Approval page sent to the founder:</p>
          <input type="text" readOnly value={approvalUrl} />
          <p className="small muted" style={{ marginTop: 12 }}>If the founder replied OK to the email instead, record the approval here (same terms as the approval page):</p>
          <ActionButton kind="approve_email" id={i.id} label="Founder replied OK: mark as approved" />
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
