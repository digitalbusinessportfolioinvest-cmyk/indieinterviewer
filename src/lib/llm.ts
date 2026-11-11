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

Rules for Deep Dive questions: the founder shares only what they are comfortable with, and numbers are always optional. Never push for figures they chose not to give. Only follow up on a Deep Dive answer if it is nearly empty and gives no usable information at all.

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
