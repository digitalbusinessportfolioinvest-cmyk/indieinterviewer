import { db } from "./db";
import { judgeAnswer, rewriteHeadings, editAnswers, polishEdition, writeIntro, type Intro } from "./llm";
import { sendCompletedToAdmins, sendDraftForReview } from "./emails";
import { randomToken } from "./tokens";
import { introFormat } from "./formats";
import { checkLinks, findLinks, type LinkCheck } from "./links";
import { brandForQuestionnaire } from "./brand";
import { takeHomepageScreenshot } from "./screenshot";
import { config } from "./config";

export type Interview = {
  id: number;
  token: string;
  approval_token: string;
  questionnaire_id: number;
  founder_name: string;
  founder_email: string;
  company: string | null;
  status: string;
  current_position: number;
  deep_intro_shown: boolean;
  deep_skipped_count: number;
  analysis: string | null;
  draft: Draft | null;
  draft_status: string;
  approval_clause: string | null;
  approval_email: string | null;
  approved_at: Date | null;
  published_at: Date | null;
  homepage_url: string | null;
  review_token: string | null;
  closing_step: "photo" | "review_ask" | "review";
  screenshot_error: string | null;
  publication_date: string | null;
  completed_at: Date | null;
  created_at: Date;
};

export type Question = {
  id: number;
  position: number;
  layer: "public" | "deep" | "closing";
  section: string | null;
  prompt: string;
  helper: string | null;
};

export type DraftItem = {
  questionId: number;
  layer: "public" | "deep" | "closing";
  section: string | null;
  original: string;
  heading: string;
  answer: string;
  /** The founder's answer as written, when it was translated into English or typo-corrected for the draft. */
  sourceAnswer?: string;
  sourceLanguage?: string;
  sourceMode?: "translated" | "corrected" | "edited";
  /** What the editing steps did to this answer, for the editor to check. */
  notes?: string[];
};

export type Draft = {
  items: DraftItem[];
  generatedAt: string;
  headingsRewritten: boolean;
  /** Manual placement of the founder's images: upload id -> question id it follows, or "none" to leave it out. */
  imagePlacement?: Record<string, number | "none">;
  intro?: Intro;
  /** Things the founder promised to send later. */
  pending?: string[];
  /** Places where the edition is incomplete and the editor should check. */
  gaps?: string[];
  /** Questions left out because nothing in the answer was for the reader. */
  dropped?: { heading: string; reason: string }[];
  /** Changes made by the final review pass. */
  polishNotes?: string[];
  links?: LinkCheck[];
};

export type Message = { id: number; role: "interviewer" | "founder"; kind: string; content: string; question_id: number | null };

const SKIP_WORDS = new Set(["skip", "skip.", "skip!", "pass", "pass."]);

export function isSkip(text: string) {
  return SKIP_WORDS.has(text.trim().toLowerCase());
}

export async function getInterviewByToken(token: string): Promise<Interview | null> {
  const [row] = await db()`SELECT * FROM interviews WHERE token = ${token}`;
  return (row as unknown as Interview) ?? null;
}

export async function getInterviewById(id: number): Promise<Interview | null> {
  const [row] = await db()`SELECT * FROM interviews WHERE id = ${id}`;
  return (row as unknown as Interview) ?? null;
}

export async function getQuestionnaire(id: number) {
  const [row] = await db()`SELECT * FROM questionnaires WHERE id = ${id}`;
  return row as unknown as { id: number; welcome: string; deep_dive_intro: string; closing: string; rights_clause: string; version: string };
}

export async function getQuestions(questionnaireId: number): Promise<Question[]> {
  const rows = await db()`SELECT id, position, layer, section, prompt, helper FROM questions WHERE questionnaire_id = ${questionnaireId} ORDER BY position`;
  return rows as unknown as Question[];
}

export function questionText(q: Question) {
  const head = q.section ? `${q.section}\n\n${q.prompt}` : q.prompt;
  return q.helper ? `${head}\n\n${q.helper}` : head;
}

async function addMessage(interviewId: number, role: "interviewer" | "founder", kind: string, content: string, questionId: number | null = null) {
  await db()`INSERT INTO messages (interview_id, question_id, role, kind, content) VALUES (${interviewId}, ${questionId}, ${role}, ${kind}, ${content})`;
}

export async function getMessages(interviewId: number): Promise<Message[]> {
  const rows = await db()`SELECT id, role, kind, content, question_id FROM messages WHERE interview_id = ${interviewId} ORDER BY id`;
  return rows as unknown as Message[];
}

/** First visit: post the welcome and the first question. Idempotent. */
export async function ensureStarted(i: Interview) {
  if (i.status !== "invited") return;
  const sql = db();
  const [claimed] = await sql`
    UPDATE interviews SET status = 'in_progress', started_at = now(), updated_at = now()
    WHERE id = ${i.id} AND status = 'invited' RETURNING id`;
  if (!claimed) return;
  const qn = await getQuestionnaire(i.questionnaire_id);
  const questions = await getQuestions(i.questionnaire_id);
  await addMessage(i.id, "interviewer", "welcome", qn.welcome);
  const first = questions[0];
  if (first) await addMessage(i.id, "interviewer", "question", questionText(first), first.id);
}

async function advance(i: Interview, questions: Question[], fromPosition: number) {
  const sql = db();
  const next = questions.find((q) => q.position > fromPosition);
  if (!next) {
    const qn = await getQuestionnaire(i.questionnaire_id);
    await addMessage(i.id, "interviewer", "closing", qn.closing);
    await sql`UPDATE interviews SET current_position = ${fromPosition + 1}, updated_at = now() WHERE id = ${i.id}`;
    return;
  }
  if (next.layer === "deep" && !i.deep_intro_shown) {
    const qn = await getQuestionnaire(i.questionnaire_id);
    await addMessage(i.id, "interviewer", "deep_intro", qn.deep_dive_intro);
    await sql`UPDATE interviews SET deep_intro_shown = true WHERE id = ${i.id}`;
  }
  await addMessage(i.id, "interviewer", "question", questionText(next), next.id);
  await sql`UPDATE interviews SET current_position = ${next.position}, updated_at = now() WHERE id = ${i.id}`;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Handles one founder message for the question currently open.
 * Answers are saved before any AI call, so nothing is lost if the model is slow or down.
 */
export async function submitAnswer(token: string, rawText: string): Promise<SubmitResult> {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, error: "Please write an answer first." };
  if (text.length > 20000) return { ok: false, error: "That answer is too long. Please shorten it a little." };

  const sql = db();
  const i = await getInterviewByToken(token);
  if (!i) return { ok: false, error: "Interview not found." };
  if (i.status !== "in_progress") return { ok: false, error: "This interview is not open for answers." };

  const questions = await getQuestions(i.questionnaire_id);
  const q = questions.find((x) => x.position === i.current_position);
  if (!q) return { ok: false, error: "There is no open question. You can review your answers and finish." };

  const [{ n: recentAnswers }] = await sql`
    SELECT count(*)::int AS n FROM messages
    WHERE interview_id = ${i.id} AND role = 'founder' AND created_at > now() - interval '1 hour'`;
  if (recentAnswers >= config.answersPerInterviewHour()) {
    return { ok: false, error: "You're sending answers very quickly. Please wait a little and try again; nothing you've written so far is lost." };
  }

  await addMessage(i.id, "founder", "answer", text, q.id);

  if (q.layer === "deep" && isSkip(text)) {
    const [existing] = await sql`SELECT text FROM answers WHERE interview_id = ${i.id} AND question_id = ${q.id}`;
    if (!existing || !existing.text) {
      await sql`
        INSERT INTO answers (interview_id, question_id, text, skipped) VALUES (${i.id}, ${q.id}, '', true)
        ON CONFLICT (interview_id, question_id) DO UPDATE SET skipped = true, updated_at = now()`;
      await sql`UPDATE interviews SET deep_skipped_count = deep_skipped_count + 1 WHERE id = ${i.id}`;
    }
    await advance(i, questions, q.position);
    return { ok: true };
  }

  const [ans] = await sql`
    INSERT INTO answers (interview_id, question_id, text) VALUES (${i.id}, ${q.id}, ${text})
    ON CONFLICT (interview_id, question_id) DO UPDATE
      SET text = CASE WHEN answers.text = '' THEN EXCLUDED.text ELSE answers.text || E'\n\n' || EXCLUDED.text END,
          skipped = false, updated_at = now()
    RETURNING text, followups_used`;

  if (ans.followups_used < 2) {
    try {
      const b = await brandForQuestionnaire(i.questionnaire_id);
      const verdict = await judgeAnswer({
        interviewId: i.id,
        newsletter: { name: b.name, about: b.about },
        layer: q.layer,
        section: q.section,
        prompt: q.prompt,
        helper: q.helper,
        answer: ans.text,
        attempt: (ans.followups_used + 1) as 1 | 2,
      });
      if (verdict.followup) {
        await sql`UPDATE answers SET followups_used = followups_used + 1 WHERE interview_id = ${i.id} AND question_id = ${q.id}`;
        await addMessage(i.id, "interviewer", "followup", verdict.message, q.id);
        return { ok: true };
      }
    } catch (err) {
      // If the model is unavailable the interview simply moves on.
      console.error("[followup] skipped:", err instanceof Error ? err.message : err);
    }
  }

  await advance(i, questions, q.position);
  return { ok: true };
}

export async function getAnswers(interviewId: number) {
  const rows = await db()`
    SELECT a.question_id, a.text, a.skipped, q.position, q.layer, q.section, q.prompt, q.helper
    FROM answers a JOIN questions q ON q.id = a.question_id
    WHERE a.interview_id = ${interviewId} ORDER BY q.position`;
  return rows as unknown as { question_id: number; text: string; skipped: boolean; position: number; layer: string; section: string | null; prompt: string; helper: string | null }[];
}

/** Founder edits an answer from the review screen before finishing. */
export async function editAnswer(token: string, questionId: number, rawText: string): Promise<SubmitResult> {
  const sql = db();
  const i = await getInterviewByToken(token);
  if (!i || i.status !== "in_progress") return { ok: false, error: "This interview can no longer be edited." };
  const questions = await getQuestions(i.questionnaire_id);
  const q = questions.find((x) => x.id === questionId);
  if (!q || q.position >= i.current_position) return { ok: false, error: "You can only edit questions you have already answered." };
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (text.length > 20000) return { ok: false, error: "That answer is too long." };
  if (!text && q.layer !== "deep") return { ok: false, error: "This answer can't be empty." };
  const skipped = q.layer === "deep" && !text;
  const [prev] = await sql`SELECT skipped FROM answers WHERE interview_id = ${i.id} AND question_id = ${q.id}`;
  await sql`
    INSERT INTO answers (interview_id, question_id, text, skipped) VALUES (${i.id}, ${q.id}, ${text}, ${skipped})
    ON CONFLICT (interview_id, question_id) DO UPDATE SET text = EXCLUDED.text, skipped = EXCLUDED.skipped, updated_at = now()`;
  const wasSkipped = prev ? Boolean(prev.skipped) : false;
  if (wasSkipped !== skipped) {
    await sql`UPDATE interviews SET deep_skipped_count = GREATEST(0, deep_skipped_count + ${skipped ? 1 : -1}) WHERE id = ${i.id}`;
  }
  return { ok: true };
}

const REVIEW_ASK = "Would you like to review your answers before sending the interview? You can read them all and edit anything you want.";

/** Moves the founder through the closing steps: photo, then the review question, then (optionally) the review screen. */
export async function closingStep(token: string, action: "photo_done" | "photo_skip" | "review"): Promise<SubmitResult> {
  const sql = db();
  const i = await getInterviewByToken(token);
  if (!i) return { ok: false, error: "Interview not found." };
  const questions = await getQuestions(i.questionnaire_id);
  const last = questions[questions.length - 1];
  if (i.status !== "in_progress" || !last || i.current_position <= last.position) return { ok: false, error: "Please answer all the questions first." };
  if (action === "review") {
    if (i.closing_step !== "review_ask") return { ok: true };
    await addMessage(i.id, "founder", "note", "I'd like to review my answers.");
    await sql`UPDATE interviews SET closing_step = 'review', updated_at = now() WHERE id = ${i.id}`;
    return { ok: true };
  }
  if (i.closing_step !== "photo") return { ok: true };
  await addMessage(i.id, "founder", "note", action === "photo_done" ? "Done with the images." : "No photo, thanks.");
  await addMessage(i.id, "interviewer", "note", REVIEW_ASK);
  await sql`UPDATE interviews SET closing_step = 'review_ask', updated_at = now() WHERE id = ${i.id}`;
  return { ok: true };
}

export async function finishInterview(token: string): Promise<SubmitResult> {
  const sql = db();
  const i = await getInterviewByToken(token);
  if (!i) return { ok: false, error: "Interview not found." };
  const questions = await getQuestions(i.questionnaire_id);
  const last = questions[questions.length - 1];
  if (i.status !== "in_progress" || !last || i.current_position <= last.position) {
    return { ok: false, error: "Please answer all the questions before finishing." };
  }
  const [row] = await sql`
    UPDATE interviews SET status = 'completed', completed_at = now(), draft_status = 'generating', updated_at = now()
    WHERE id = ${i.id} AND status = 'in_progress' RETURNING *`;
  if (!row) return { ok: true };
  void generateDraft(i.id);
  void takeHomepageScreenshot(i.id).catch((err) => console.error("[screenshot]", err));
  return { ok: true };
}

/** Builds the review draft: answers merged with their follow-ups and cleaned (translated, typos fixed, remarks to the
 *  interviewer removed), headings rewritten, a final review pass, the intro and a check of the links. */
export async function generateDraft(interviewId: number) {
  const sql = db();
  const i = await getInterviewById(interviewId);
  if (!i) return;
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const newsletter = { name: b.name, about: b.about };
  const answers = await getAnswers(interviewId);
  const answered = answers.filter((a) => !a.skipped && a.text.trim());
  let items: DraftItem[] = answered.map((a) => ({
    questionId: a.question_id,
    layer: a.layer as DraftItem["layer"],
    section: a.section,
    original: a.prompt,
    heading: a.prompt,
    answer: a.text,
  }));
  const dropped: { heading: string; reason: string }[] = [];
  let pending: string[] = [];
  let gaps: string[] = [];

  // 1. One coherent English answer per question: replies to follow-ups merged in, remarks to the interviewer left out.
  try {
    const msgs = await sql`SELECT question_id, role, kind, content FROM messages WHERE interview_id = ${interviewId} AND question_id IS NOT NULL ORDER BY id`;
    const conv = new Map<number, { role: string; text: string }[]>();
    for (const m of msgs) {
      const role = m.role === "founder" ? "founder" : m.kind === "followup" ? "interviewer follow-up" : "interviewer question";
      conv.set(m.question_id, [...(conv.get(m.question_id) ?? []), { role, text: m.content }]);
    }
    const ed = await editAnswers({
      interviewId,
      items: items.map((it) => ({ id: it.questionId, question: it.original, saved: it.answer, conversation: conv.get(it.questionId) ?? [] })),
    });
    pending = ed.pending;
    gaps = ed.gaps;
    const kept: DraftItem[] = [];
    for (const it of items) {
      const e = ed.items.get(it.questionId);
      if (!e) { kept.push(it); continue; }
      if (e.drop) { dropped.push({ heading: it.original, reason: e.notes.join("; ") || "Nothing in the answer was for the reader" }); continue; }
      if (e.english !== it.answer) { it.sourceAnswer = it.answer; it.sourceLanguage = e.language; it.sourceMode = "edited"; it.answer = e.english; }
      if (e.notes.length) it.notes = e.notes;
      kept.push(it);
    }
    items = kept;
  } catch (err) {
    console.error("[draft] answer editing failed:", err instanceof Error ? err.message : err);
  }

  // 2. Headings rewritten so they don't repeat from one issue to the next.
  let rewritten = false;
  try {
    const recent = await sql`
      SELECT i.draft FROM interviews i
      JOIN questionnaires q ON q.id = i.questionnaire_id
      WHERE i.id <> ${interviewId} AND i.draft IS NOT NULL
        AND q.newsletter_id = (SELECT newsletter_id FROM questionnaires WHERE id = ${i.questionnaire_id})
      ORDER BY i.completed_at DESC NULLS LAST LIMIT 8`;
    const recentHeadings: string[] = [];
    for (const r of recent) {
      const d = r.draft as Draft;
      for (const it of d?.items ?? []) if (it.heading !== it.original) recentHeadings.push(it.heading);
    }
    const map = await rewriteHeadings({
      interviewId: i.id,
      newsletter,
      founder: i.founder_name,
      company: i.company,
      items: items.map((it) => ({ id: it.questionId, prompt: it.original, answer: it.answer })),
      recentHeadings: recentHeadings.slice(0, 150),
    });
    for (const it of items) {
      const h = map.get(it.questionId);
      if (h) it.heading = h;
    }
    rewritten = map.size > 0;
  } catch (err) {
    console.error("[draft] heading rewrite failed:", err instanceof Error ? err.message : err);
  }

  // 3. Final review pass over the whole edition.
  let polishNotes: string[] = [];
  try {
    const p = await polishEdition({ interviewId, newsletter, items: items.map((it) => ({ id: it.questionId, heading: it.heading, answer: it.answer })) });
    for (const it of items) {
      const r = p.items.get(it.questionId);
      if (!r) continue;
      if (r.answer !== it.answer) { if (!it.sourceAnswer) { it.sourceAnswer = it.answer; it.sourceMode = "edited"; } it.answer = r.answer; }
      it.heading = r.heading;
    }
    polishNotes = p.notes;
  } catch (err) {
    console.error("[draft] final review failed:", err instanceof Error ? err.message : err);
  }

  // 4. Intro in the publication's format.
  let intro: Intro | undefined;
  try {
    intro = (await writeIntro({
      interviewId,
      newsletter,
      format: introFormat(b.slug),
      founder: i.founder_name,
      company: i.company,
      publicItems: items.filter((it) => it.layer !== "deep").map((it) => ({ heading: it.heading, answer: it.answer })),
      deepItems: items.filter((it) => it.layer === "deep").map((it) => ({ heading: it.heading, answer: it.answer })),
    })) ?? undefined;
  } catch (err) {
    console.error("[draft] intro failed:", err instanceof Error ? err.message : err);
  }

  // 5. Links the founder mentions: checked so a broken one is flagged before publishing.
  let links: LinkCheck[] = [];
  try {
    links = await checkLinks([...new Set(items.flatMap((it) => findLinks(it.answer)))]);
  } catch (err) {
    console.error("[draft] link check failed:", err instanceof Error ? err.message : err);
  }

  const draft: Draft = { items, generatedAt: new Date().toISOString(), headingsRewritten: rewritten, intro, pending, gaps, dropped, polishNotes, links };
  if (i.draft?.imagePlacement) draft.imagePlacement = i.draft.imagePlacement; // keep manual photo placement
  await sql`
    UPDATE interviews SET draft = ${sql.json(draft as never)}, draft_status = ${rewritten ? "ready" : "failed"},
      status = CASE WHEN status = 'completed' THEN 'in_review' ELSE status END, updated_at = now()
    WHERE id = ${interviewId}`;

  // Email the draft to the admins with a one-click approve link (replaces the plain "finished" notice).
  try {
    // Give the homepage screenshot (taken in parallel) up to a minute so the edition has its cover.
    for (let t = 0; t < 12; t++) {
      const [s] = await sql`
        SELECT (SELECT count(*) FROM uploads WHERE interview_id = ${interviewId} AND kind = 'screenshot')::int AS shots, screenshot_error
        FROM interviews WHERE id = ${interviewId}`;
      if (!s || s.shots > 0 || s.screenshot_error) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    const fresh = await getInterviewById(interviewId);
    if (fresh?.draft && ["in_review", "completed"].includes(fresh.status)) {
      const reviewToken = randomToken(18);
      await sql`UPDATE interviews SET review_token = ${reviewToken} WHERE id = ${interviewId}`;
      await sendDraftForReview({ ...fresh, review_token: reviewToken, draft: fresh.draft });
    } else if (fresh && !fresh.draft) {
      await sendCompletedToAdmins(fresh);
    }
  } catch (err) {
    console.error("[draft] review email failed:", err instanceof Error ? err.message : err);
  }
}
