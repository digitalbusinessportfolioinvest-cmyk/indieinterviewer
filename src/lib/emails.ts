import { escapeHtml, layout, sendEmail, textWithLink } from "./email";
import type { Draft } from "./interview";
import { introLines, buildEdition, type Edition } from "./edition";
import { linkParts } from "./links";
import { config } from "./config";
import { brandForQuestionnaire, fromHeader, type Brand } from "./brand";

type Button = { label: string; url: string };

function send(kind: string, to: string | string[], subject: string, paragraphs: string[], button?: Button, interviewId?: number, idempotencyKey?: string, brand?: Brand) {
  return sendEmail({
    kind,
    to,
    subject,
    text: textWithLink(paragraphs, button),
    html: layout(paragraphs, button, brand?.name),
    interviewId,
    idempotencyKey,
    from: brand ? fromHeader(brand) : undefined,
    replyTo: brand?.replyTo,
  });
}

type WithQn = { id: number; questionnaire_id: number };

export function sendMagicLink(email: string, url: string) {
  return send("magic_link", email, "Your IndieInterviewer sign-in link", [
    "Use the button below to sign in to IndieInterviewer. The link works once and expires in 20 minutes.",
    "If you didn't ask for it, you can ignore this email.",
  ], { label: "Sign in", url });
}

export async function sendInvitation(i: WithQn & { founder_name: string; founder_email: string; token: string }) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/i/${i.token}`;
  return send("invitation", i.founder_email, `Your ${b.name} interview`, [
    `Hi ${i.founder_name},`,
    `Thanks for agreeing to be interviewed for ${b.name}. The interview runs on the page below: the questions come one at a time, everything you write is saved as you go, and you can pause and come back to it whenever you like using the same link.`,
  ], { label: "Start the interview", url }, i.id, `invite-${i.id}-${i.token.slice(0, 8)}`, b);
}

export async function sendReminder(i: WithQn & { founder_name: string; founder_email: string; token: string }, answered: number, total: number) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/i/${i.token}`;
  return send("reminder", i.founder_email, `Your ${b.name} interview is waiting for you`, [
    `Hi ${i.founder_name},`,
    `Just a friendly reminder: your ${b.name} interview is waiting where you left it. You've answered ${answered} of ${total} questions, and everything you wrote is saved.`,
    "Whenever you have a moment, you can pick it up with the same link.",
  ], { label: "Continue the interview", url }, i.id, `reminder-${i.id}`, b);
}

export async function sendCompletedToAdmins(i: WithQn & { founder_name: string; company: string | null; deep_skipped_count: number }) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/admin/interviews/${i.id}`;
  const deep = i.deep_skipped_count > 0
    ? `The founder skipped ${i.deep_skipped_count} Deep Dive question(s), so this one needs an analysis.`
    : "The founder answered every Deep Dive question.";
  return send("completed", config.adminEmails(), `Interview finished: ${i.founder_name}${i.company ? ` (${i.company})` : ""}`, [
    `${i.founder_name} has finished the ${b.name} interview.`,
    deep,
    "The draft with the rewritten question headings is being generated and will be ready for review in a few minutes.",
  ], { label: "Review the interview", url }, i.id, `completed-${i.id}`, b);
}

export async function sendApprovalRequest(i: WithQn & { founder_name: string; founder_email: string; approval_token: string; draft: Draft | null; analysis: string | null }) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/approve/${i.approval_token}`;
  const paragraphs = [
    `Hi ${i.founder_name},`,
    "Your interview is ready: this is the edition we will publish, with the cover and your photos. You can read it below or on the page linked from the button and, if everything reflects your answers, approve it there.",
    "If anything needs changing, just reply to this email and tell us what.",
  ];
  const button = { label: "Read and approve", url };
  if (!i.draft) return send("approval_request", i.founder_email, `Your ${b.name} interview is ready for your approval`, paragraphs, button, i.id, undefined, b);
  const edition = await buildEdition(i.id, i.draft, i.analysis);
  return sendEmail({
    kind: "approval_request",
    to: i.founder_email,
    subject: `Your ${b.name} interview is ready for your approval`,
    text: `${textWithLink(paragraphs, button)}\n\n---\n\n${editionText(edition, false)}`,
    html: layout(paragraphs, button, b.name, editionHtml(edition, false)),
    interviewId: i.id,
    from: fromHeader(b),
    replyTo: b.replyTo,
  });
}

export async function sendChangeRequestToAdmins(i: WithQn & { founder_name: string; company: string | null }, heading: string, text: string) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/admin/interviews/${i.id}`;
  return send("change_request", config.adminEmails(), `Change requested: ${i.founder_name}${i.company ? ` (${i.company})` : ""} · ${b.name}`, [
    `${i.founder_name} asked for a change in the ${b.name} interview.`,
    `Answer: ${heading || "(general)"}`,
    `Request: ${text}`,
    "Edit the draft in the panel and send it for approval again; the founder will get the updated edition.",
  ], { label: "Open the interview", url }, i.id, undefined, b);
}

export async function sendApprovedToAdmins(i: WithQn & { founder_name: string; company: string | null }) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/admin/interviews/${i.id}`;
  return send("approved", config.adminEmails(), `Approved: ${i.founder_name}${i.company ? ` (${i.company})` : ""}`, [
    `${i.founder_name} has approved the ${b.name} interview and accepted the rights clause.`,
    "The next step is to send them the estimated publication date.",
  ], { label: "Open the interview", url }, i.id, `approved-${i.id}`, b);
}

export async function sendPublicationDate(i: WithQn & { founder_name: string; founder_email: string }, dateLabel: string) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  return send("publication_date", i.founder_email, `Your ${b.name} interview: publication date`, [
    `Hi ${i.founder_name},`,
    `Thanks for approving your interview. It is scheduled to be published in ${b.name} on ${dateLabel}.`,
    "We'll let you know if anything changes.",
  ], undefined, i.id, undefined, b);
}

function linkedHtml(text: string) {
  return linkParts(text).map((p) => (p.href ? `<a href="${escapeHtml(p.href)}" style="color:#2b5d8a">${escapeHtml(p.text)}</a>` : escapeHtml(p.text))).join("");
}

function editionHtml(e: Edition, forAdmin = true) {
  const img = (u: string, alt: string) => `<img src="${escapeHtml(u)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:1px solid #ddd;border-radius:6px;margin:18px 0">`;
  let html = "";
  if (e.intro) {
    html += `<h1 style="font-size:24px;line-height:1.25;margin:20px 0 6px">${escapeHtml(e.intro.title)}</h1>`;
    if (e.intro.subtitle) html += `<p style="font-size:16px;color:#555;margin:0 0 8px">${escapeHtml(e.intro.subtitle)}</p>`;
  }
  html += e.cover ? img(e.cover.url, "Cover") : forAdmin ? `<p style="color:#a3271c;font-size:14px">No cover yet (homepage screenshot missing).</p>` : "";
  if (e.intro) {
    const [first, ...rest] = e.intro.hook.split(/(?<=[.!?])\s+/);
    html += `<p style="line-height:1.55;margin:0 0 10px"><strong>${escapeHtml(first)}</strong>${rest.length ? ` ${escapeHtml(rest.join(" "))}` : ""}</p>`;
    if (e.intro.snapshot) html += `<p style="color:#555;margin:0 0 10px">Snapshot: ${escapeHtml(e.intro.snapshot)}</p>`;
    for (const bl of e.intro.bullets) if (bl.text) html += `<p style="margin:0 0 8px"><strong>${escapeHtml(bl.label)}:</strong> → ${escapeHtml(bl.text)}</p>`;
    if (e.intro.teaser) html += `<p style="margin:10px 0 0">${escapeHtml(e.intro.teaser)}</p>`;
  }
  for (const bl of e.blocks) {
    if (bl.type === "section") html += `<div style="margin:28px 0 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666">${escapeHtml(bl.label)}</div>`;
    else if (bl.type === "image") html += img(bl.image.url, bl.image.filename);
    else html += `<h3 style="font-size:16px;margin:22px 0 6px">${escapeHtml(bl.heading)}</h3><p style="margin:0;line-height:1.55;white-space:pre-wrap">${linkedHtml(bl.answer.trim())}</p>`;
  }
  return `<div style="border-top:1px solid #ddd;margin-top:28px;padding-top:4px">${html}</div>`;
}

function editionText(e: Edition, forAdmin = true) {
  const parts: string[] = [];
  if (e.intro) parts.push(e.intro.title.toUpperCase(), e.intro.subtitle);
  if (e.cover) parts.push(`[Cover: ${e.cover.url}]`);
  else if (forAdmin) parts.push("[No cover yet]");
  if (e.intro) parts.push(...introLines(e.intro, "text"));
  for (const bl of e.blocks) {
    if (bl.type === "section") parts.push(bl.label.toUpperCase());
    else if (bl.type === "image") parts.push(`[Image: ${bl.image.url}]`);
    else parts.push(`${bl.heading}\n${bl.answer.trim()}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Editor's checklist for the review email: title options, pull quote, what was edited, pending items, gaps, links. */
function reviewNotes(d: Draft): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  if (d.intro?.titles?.length) out.push({ title: "Title options (the first one is used)", lines: d.intro.titles.map((t) => `${t.title} | ${t.subtitle}`) });
  if (d.intro?.pullQuote) out.push({ title: "Suggested pull quote", lines: [d.intro.pullQuote] });
  if (d.pending?.length) out.push({ title: "Pending from the founder", lines: d.pending });
  if (d.gaps?.length) out.push({ title: "Gaps to fill or check", lines: d.gaps });
  const broken = (d.links ?? []).filter((l) => !l.ok);
  if (broken.length) out.push({ title: "Links that didn't load", lines: broken.map((l) => `${l.url} (${l.status})`) });
  if (d.dropped?.length) out.push({ title: "Answers left out", lines: d.dropped.map((x) => `${x.heading}: ${x.reason}`) });
  const edits = d.items.filter((it) => it.notes?.length).map((it) => `${it.heading}: ${it.notes!.join("; ")}`);
  if (edits.length) out.push({ title: "Edits to the answers", lines: edits });
  if (d.polishNotes?.length) out.push({ title: "Final review pass", lines: d.polishNotes });
  return out;
}

function reviewNotesHtml(d: Draft) {
  return reviewNotes(d).map((sct) => `<p style="margin:16px 0 4px;font-weight:600;font-size:14px">${escapeHtml(sct.title)}</p><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${sct.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`).join("");
}

function reviewNotesText(d: Draft) {
  return reviewNotes(d).map((sct) => `${sct.title.toUpperCase()}\n${sct.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n");
}

/** Sends the finished draft to the admins with a one-click link to approve it and send it to the founder. */
export async function sendDraftForReview(i: WithQn & {
  founder_name: string; company: string | null; deep_skipped_count: number;
  draft: Draft; analysis: string | null; review_token: string; homepage_url: string | null;
}) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const panel = `${config.appUrl()}/admin/interviews/${i.id}`;
  const needsAnalysis = i.deep_skipped_count > 0 && !i.analysis?.trim();
  const paragraphs = [
    `${i.founder_name}${i.company ? ` (${i.company})` : ""} has finished the ${b.name} interview. Below is the assembled edition after the final review pass, with the editor's checklist first. The founder's original answers are in the panel.`,
    needsAnalysis
      ? `The founder skipped ${i.deep_skipped_count} Deep Dive question(s), so it needs your analysis before it can go to the founder. Write it in the panel and send it from there.`
      : "If it's good to go, approve it with the button and it will be sent to the founder for their approval. To change anything first, edit it in the panel.",
  ];
  const edition = await buildEdition(i.id, i.draft, i.analysis);
  const button = needsAnalysis
    ? { label: "Open in the panel", url: panel }
    : { label: "Approve and send to founder", url: `${config.appUrl()}/review/${i.review_token}` };
  const extra = `${needsAnalysis ? "" : `<p style="margin:0 0 8px;font-size:14px"><a href="${escapeHtml(panel)}" style="color:#333">Edit in the panel</a></p>`}${reviewNotesHtml(i.draft)}${editionHtml(edition)}`;
  return sendEmail({
    kind: "draft_review",
    to: config.adminEmails(),
    subject: `Review: ${i.founder_name}${i.company ? ` (${i.company})` : ""} · ${b.name}`,
    text: `${textWithLink(paragraphs, button)}\n\nPanel: ${panel}\n\n${reviewNotesText(i.draft)}\n\n---\n\n${editionText(edition)}`,
    html: layout(paragraphs, button, b.name, extra),
    interviewId: i.id,
    from: fromHeader(b),
    replyTo: b.replyTo,
  });
}
