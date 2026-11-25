import { config } from "./config";
import { db } from "./db";

export class BudgetExceeded extends Error {}

/** Throws BudgetExceeded when the hourly spend cap or the per-interview call cap is reached. */
async function checkBudget(interviewId: number | null) {
  const sql = db();
  const [g] = await sql`SELECT COALESCE(SUM(cost_usd), 0)::float AS spent FROM llm_usage WHERE created_at > now() - interval '1 hour'`;
  if (g.spent >= config.llmHourlyBudgetUsd()) throw new BudgetExceeded(`hourly budget reached ($${g.spent.toFixed(2)})`);
  if (interviewId !== null) {
    const [c] = await sql`SELECT count(*)::int AS n FROM llm_usage WHERE interview_id = ${interviewId} AND created_at > now() - interval '1 hour'`;
    if (c.n >= config.llmCallsPerInterviewHour()) throw new BudgetExceeded(`per-interview hourly call cap reached (${c.n})`);
  }
}

async function recordUsage(interviewId: number | null, kind: string, cost: number) {
  await db()`INSERT INTO llm_usage (interview_id, kind, cost_usd) VALUES (${interviewId}, ${kind}, ${cost})`;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function chat(messages: ChatMessage[], opts: { effort: "low" | "medium" | "high"; maxTokens: number; timeoutMs: number; interviewId: number | null; kind: string }) {
  await checkBudget(opts.interviewId);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": config.appUrl(),
        "X-Title": "IndieInterviewer",
      },
      body: JSON.stringify({
        model: config.model(),
        messages,
        max_tokens: opts.maxTokens,
        reasoning: { effort: opts.effort },
        usage: { include: true },
      }),
    });
    const body = await res.json().catch(() => ({}));
    const cost = Number(body?.usage?.cost ?? 0);
    await recordUsage(opts.interviewId, opts.kind, Number.isFinite(cost) ? cost : 0).catch(() => {});
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body?.error?.message ?? "request failed"}`);
    const content: string = body?.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("OpenRouter returned an empty response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson<T>(raw: string): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

const followupSystem = (name: string, about: string) => `You are the interviewer for ${name}, ${about}. You are judging one answer in a written interview the founder fills in on their own.

Decide whether the answer is too short or incomplete to be publishable for this question. Ask a follow-up only when the answer is clearly thin: a few words, evasive, missing the core of what was asked, or so vague a reader would learn nothing. A concise but complete answer does NOT need a follow-up. Never ask a follow-up just to get more of something the founder already covered well.

Rules for Deep Dive questions: judge them with the same standard as the public interview and follow up when an answer is thin, vague or a bare list with no explanation. The founder shares only what they are comfortable with and numbers are always optional: ask for context, reasons or examples, never insist on figures they chose not to give, and never follow up on an answer that is just "skip".

If a follow-up is needed, write it:
- In English, addressed to the founder directly, one or two sentences.
- Exceedingly polite and warm, never demanding. Ask for clarification or a little more detail on something specific in their answer, so it is clearly about what they wrote.
- Do not repeat the question verbatim, do not use bullet points, do not thank them excessively.
- On the second and final follow-up, be even more courteous: acknowledge their time and make clear that it is entirely up to them, and that a short addition is welcome.

Reply with JSON only, no other text: {"followup": true|false, "message": "the follow-up text, or empty string"}`;

export async function judgeAnswer(input: {
  interviewId: number;
  newsletter: { name: string; about: string };
  layer: string;
  section: string | null;
  prompt: string;
  helper: string | null;
  answer: string;
  attempt: 1 | 2;
}): Promise<{ followup: boolean; message: string }> {
  const user = [
    `Layer: ${input.layer === "deep" ? "Deep Dive (optional, for paid subscribers)" : input.layer === "closing" ? "Closing" : "Public interview"}`,
    input.section ? `Section: ${input.section}` : null,
    `Question: ${input.prompt}`,
    input.helper ? `Guidance shown to the founder:\n${input.helper}` : null,
    `This would be follow-up number ${input.attempt} of at most 2.`,
    `Founder's answer so far:\n"""\n${input.answer}\n"""`,
  ].filter(Boolean).join("\n\n");
  const raw = await chat(
    [{ role: "system", content: followupSystem(input.newsletter.name, input.newsletter.about) }, { role: "user", content: user }],
    { effort: "low", maxTokens: 1200, timeoutMs: 45_000, interviewId: input.interviewId, kind: "followup" },
  );
  const out = parseJson<{ followup?: boolean; message?: string }>(raw);
  const message = (out.message ?? "").trim();
  return { followup: Boolean(out.followup) && message.length > 0, message };
}

const headingsSystem = (name: string, about: string) => `You prepare written founder interviews for publication in ${name}, ${about}.

The questionnaire is standard, but in each published interview the questions are reworded so they read naturally as a conversation with this specific founder, adapted to what they actually answered. You will receive every question with the founder's answer.

For each item, write a new heading: the question rephrased so it flows naturally into that founder's answer. Rules:
- Keep the meaning of the original question; it must still be a question the answer responds to.
- Conversational, specific to this founder and business, never generic.
- Short: ideally under 15 words.
- No numbering, no quotation marks, no emojis.
- Do not reuse any heading from the list of recent headings you are given, and avoid their phrasing patterns, so headings never repeat from one issue to the next.
- Never change, summarise or quote the answers; you only write headings.

Reply with JSON only: {"headings": [{"id": <item id>, "heading": "..."}]}`;

export async function rewriteHeadings(input: {
  interviewId: number;
  newsletter: { name: string; about: string };
  founder: string;
  company: string | null;
  items: { id: number; prompt: string; answer: string }[];
  recentHeadings: string[];
}): Promise<Map<number, string>> {
  const user = [
    `Founder: ${input.founder}${input.company ? `, ${input.company}` : ""}`,
    input.recentHeadings.length
      ? `Recent headings already used in previous issues (do not reuse):\n${input.recentHeadings.map((h) => `- ${h}`).join("\n")}`
      : "No previous headings yet.",
    `Items:\n${JSON.stringify(input.items.map((i) => ({ id: i.id, question: i.prompt, answer: i.answer })), null, 1)}`,
  ].join("\n\n");
  const raw = await chat(
    [{ role: "system", content: headingsSystem(input.newsletter.name, input.newsletter.about) }, { role: "user", content: user }],
    { effort: "medium", maxTokens: 6000, timeoutMs: 180_000, interviewId: null, kind: "headings" },
  );
  const out = parseJson<{ headings?: { id: number; heading: string }[] }>(raw);
  const map = new Map<number, string>();
  for (const h of out.headings ?? []) {
    if (typeof h.id === "number" && typeof h.heading === "string" && h.heading.trim()) map.set(h.id, h.heading.trim());
  }
  return map;
}

const editSystem = `You prepare founder interview answers for publication in English. You receive, for each question, the founder's saved answer and the conversation behind it (the interviewer's question, any follow-up questions and every reply the founder gave). The saved answer is the founder's replies joined together.

For each item, return ONE answer that reads as a single coherent text a reader can follow:
- Merge the original reply and the replies to follow-ups into one text. Remove repetitions (when a follow-up reply restates something, say it once), but never lose a fact, figure, example, opinion or nuance the founder gave.
- Leave out anything addressed to the interviewer rather than the reader: remarks such as "it's not important", "it's ok", "I'll send them to you later by email", "this is too soon as I'm the first user", complaints about the question, or meta comments about the interview itself. Also leave out a reply that answers something other than the question.
- If, after that, nothing that answers the question is left, set "drop": true.
- Translate anything not in English into natural English, and fix typos, spelling and punctuation slips.
- Keep the founder's voice: first person, their tone, their wording where it is already clear English. Do not add anything they did not say, do not summarise, do not soften or embellish, do not explain.
- Keep names, product names, URLs, handles, numbers and currencies exactly as given.

For each item also return "notes": a short list of what you did that an editor should check, each a few words, e.g. "Merged follow-up reply about weekly hours", "Removed remark to interviewer: 'it's not important'", "Translated from Spanish", "Typos corrected". Empty list if the answer only had nothing to fix.

Also return, for the whole interview:
- "pending": things the founder said they would send or share later (e.g. "Substack and X handles and website link, promised by email").
- "gaps": places where the published text would be incomplete and an editor should fill in or check, e.g. "Connection: mentions Substack and X but gives no handles or links".

Reply with JSON only: {"items": [{"id": <item id>, "english": "...", "drop": false, "language": "<main source language, in English>", "notes": ["..."]}], "pending": ["..."], "gaps": ["..."]}`;

export type EditedAnswer = { english: string; drop: boolean; language: string; notes: string[] };

/** Merges each answer with its follow-ups, removes remarks to the interviewer, translates and fixes typos. */
export async function editAnswers(input: {
  interviewId: number;
  items: { id: number; question: string; saved: string; conversation: { role: string; text: string }[] }[];
}) {
  const raw = await chat(
    [{ role: "system", content: editSystem }, { role: "user", content: JSON.stringify(input.items, null, 1) }],
    { effort: "medium", maxTokens: 24000, timeoutMs: 300_000, interviewId: null, kind: "edit" },
  );
  const out = parseJson<{ items?: { id: number; english?: string; drop?: boolean; language?: string; notes?: string[] }[]; pending?: string[]; gaps?: string[] }>(raw);
  const map = new Map<number, EditedAnswer>();
  for (const t of out.items ?? []) {
    if (typeof t.id !== "number") continue;
    const english = String(t.english ?? "").trim();
    if (!english && !t.drop) continue;
    map.set(t.id, { english, drop: Boolean(t.drop) || !english, language: String(t.language ?? "").trim() || "English", notes: (t.notes ?? []).map(String).filter(Boolean) });
  }
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);
  return { items: map, pending: strs(out.pending), gaps: strs(out.gaps) };
}

const polishSystem = (name: string, about: string) => `You are the final editor of a written founder interview for ${name}, ${about}. You receive the whole edition: each item has a heading (the question as it will be published) and the founder's answer, already in English.

Do one full review pass so the edition reads polished:
- Each answer must respond to its heading. Headings are written by the editor, so when they don't fit, fix the HEADING, never the answer's content. Headings stay short (ideally under 15 words), conversational, no quotation marks, and must not repeat each other's wording.
- Answers: improve flow and coherence only where needed (clumsy joins between merged replies, repeated phrases, a sentence that is hard to follow). Remove any leftover of the conversation with the interviewer.
- You must NOT change what the founder says: no new facts, no removed facts, no changed opinions or tone, no softening, no embellishing, no summarising. Keep first person, names, URLs, numbers and currencies exactly.
- If an item is already fine, return it unchanged.

Return every item, plus "notes": a short list of what you changed, each a few words with the item it refers to (e.g. "Heading of the weekly hours question adjusted to fit the answer"). Empty list if nothing changed.

Reply with JSON only: {"items": [{"id": <item id>, "heading": "...", "answer": "..."}], "notes": ["..."]}`;

/** Final pass over the assembled edition: headings that fit, smooth answers, no leftover conversation. */
export async function polishEdition(input: {
  interviewId: number;
  newsletter: { name: string; about: string };
  items: { id: number; heading: string; answer: string }[];
}) {
  const raw = await chat(
    [{ role: "system", content: polishSystem(input.newsletter.name, input.newsletter.about) }, { role: "user", content: JSON.stringify(input.items, null, 1) }],
    { effort: "medium", maxTokens: 24000, timeoutMs: 300_000, interviewId: null, kind: "polish" },
  );
  const out = parseJson<{ items?: { id: number; heading?: string; answer?: string }[]; notes?: string[] }>(raw);
  const map = new Map<number, { heading: string; answer: string }>();
  for (const t of out.items ?? []) {
    const heading = String(t.heading ?? "").trim();
    const answer = String(t.answer ?? "").trim();
    if (typeof t.id === "number" && heading && answer) map.set(t.id, { heading, answer });
  }
  return { items: map, notes: Array.isArray(out.notes) ? out.notes.map(String).filter(Boolean) : [] };
}

export type Intro = {
  titles: { title: string; subtitle: string }[];
  title: string;
  subtitle: string;
  hook: string;
  snapshot?: string;
  bullets: { label: string; text: string }[];
  teaser?: string;
  pullQuote?: string;
};

const introSystem = (name: string, about: string, f: import("./formats").IntroFormat) => `You write the opening of a founder interview edition for ${name}, ${about}. You receive the founder, the public interview (headings and answers) and, separately, the Deep Dive answers for paid subscribers.

Write, in English:
1. "titles": 3 options of {"title", "subtitle"} for the post. Titles under 70 characters, specific to this founder and story, built to make subscribers open the email; numbers only if they come from the public answers. Subtitles one sentence. No clickbait, no hype words, nothing the founder didn't say.
2. "hook": two sentences that open the edition: where this founder is and what makes the story worth reading. The first sentence will be shown in bold.
${f.snapshot ? `3. "snapshot": one line of facts from the PUBLIC answers only, separated by " · " (stage, team, time invested, and similar). Never use Deep Dive information here.\n` : ""}4. "bullets": exactly three short lines (under 15 words each), in this order:
${f.bullets.map((b, k) => `   - "${b}": ${f.bulletGuide[k]}`).join("\n")}
${f.deepTeaser ? `5. "teaser": one sentence starting exactly "Besides, in the Deep Dive learn" that makes readers want the paid Deep Dive. Mention two or three topics the founder REALLY covers in their Deep Dive answers, worded positively and appealingly. Never give data, figures or conclusions (say what they talk about, not what they say), never promise an explanation the answers don't contain, and avoid unattractive topics such as unsubscribes or losses. If there are no Deep Dive answers, return an empty string.\n` : ""}6. "pullQuote": one short, striking sentence taken verbatim from the founder's public answers.

Use only what the founder said. Reply with JSON only: {"titles": [{"title": "...", "subtitle": "..."}], "hook": "...",${f.snapshot ? ' "snapshot": "...",' : ""} "bullets": ["...", "...", "..."],${f.deepTeaser ? ' "teaser": "...",' : ""} "pullQuote": "..."}`;

export async function writeIntro(input: {
  interviewId: number;
  newsletter: { name: string; about: string };
  format: import("./formats").IntroFormat;
  founder: string;
  company: string | null;
  publicItems: { heading: string; answer: string }[];
  deepItems: { heading: string; answer: string }[];
}): Promise<Intro | null> {
  const user = [
    `Founder: ${input.founder}${input.company ? `, ${input.company}` : ""}`,
    `Public interview:\n${JSON.stringify(input.publicItems, null, 1)}`,
    input.format.deepTeaser ? `Deep Dive answers (paid; use only for the teaser):\n${input.deepItems.length ? JSON.stringify(input.deepItems, null, 1) : "none"}` : null,
  ].filter(Boolean).join("\n\n");
  const raw = await chat(
    [{ role: "system", content: introSystem(input.newsletter.name, input.newsletter.about, input.format) }, { role: "user", content: user }],
    { effort: "medium", maxTokens: 6000, timeoutMs: 180_000, interviewId: null, kind: "intro" },
  );
  const out = parseJson<{ titles?: { title?: string; subtitle?: string }[]; hook?: string; snapshot?: string; bullets?: string[]; teaser?: string; pullQuote?: string }>(raw);
  const titles = (out.titles ?? []).map((t) => ({ title: String(t.title ?? "").trim(), subtitle: String(t.subtitle ?? "").trim() })).filter((t) => t.title);
  const bullets = (out.bullets ?? []).map(String).map((b) => b.replace(/^\s*(→|->)\s*/, "").trim()).slice(0, 3);
  if (!titles.length || !out.hook) return null;
  return {
    titles,
    title: titles[0].title,
    subtitle: titles[0].subtitle,
    hook: String(out.hook).trim(),
    snapshot: input.format.snapshot ? String(out.snapshot ?? "").trim() || undefined : undefined,
    bullets: input.format.bullets.map((label, k) => ({ label, text: bullets[k] ?? "" })),
    teaser: input.format.deepTeaser ? String(out.teaser ?? "").trim() || undefined : undefined,
    pullQuote: String(out.pullQuote ?? "").trim() || undefined,
  };
}

const SPANISH_HINTS = /\b(que|pero|porque|está|muy|también|del|los|las|para|una|hay|ahí|ahi|cuando|donde|todo|esto|eso|mucho|nosotros|tengo|puedo|habría|sería)\b|[ñ¿¡]/gi;

/** True when a text still looks partly Spanish (two or more telltale words or characters). */
export function looksSpanish(text: string) {
  return (text.match(SPANISH_HINTS) ?? []).length >= 2;
}

const englishOnlySystem = `You receive interview answers that should be entirely in English but still contain parts in another language. Translate those parts into natural English and return each answer otherwise identical: same words, same order, same facts. Reply with JSON only: {"items": [{"id": <id>, "answer": "..."}]}`;

/** Translates any leftover non-English fragments; everything else is returned unchanged. */
export async function englishOnly(input: { items: { id: number; answer: string }[] }) {
  const map = new Map<number, string>();
  if (!input.items.length) return map;
  const raw = await chat(
    [{ role: "system", content: englishOnlySystem }, { role: "user", content: JSON.stringify(input.items, null, 1) }],
    { effort: "low", maxTokens: 8000, timeoutMs: 120_000, interviewId: null, kind: "english" },
  );
  const out = parseJson<{ items?: { id: number; answer?: string }[] }>(raw);
  for (const t of out.items ?? []) if (typeof t.id === "number" && t.answer?.trim()) map.set(t.id, t.answer.trim());
  return map;
}
