import { layout, sendEmail, textWithLink } from "./email";
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
  ], { label: "Review the interview", url }, i.id, `completed-${i.id}`);
}

export async function sendApprovalRequest(i: WithQn & { founder_name: string; founder_email: string; approval_token: string }) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/approve/${i.approval_token}`;
  return send("approval_request", i.founder_email, `Your ${b.name} interview is ready for your approval`, [
    `Hi ${i.founder_name},`,
    "Your interview is ready. Please read it on the page below and, if everything reflects your answers, approve it there.",
    "If anything needs changing, just reply to this email and tell us what.",
  ], { label: "Read and approve", url }, i.id, undefined, b);
}

export async function sendApprovedToAdmins(i: WithQn & { founder_name: string; company: string | null }) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  const url = `${config.appUrl()}/admin/interviews/${i.id}`;
  return send("approved", config.adminEmails(), `Approved: ${i.founder_name}${i.company ? ` (${i.company})` : ""}`, [
    `${i.founder_name} has approved the ${b.name} interview and accepted the rights clause.`,
    "The next step is to send them the estimated publication date.",
  ], { label: "Open the interview", url }, i.id, `approved-${i.id}`);
}

export async function sendPublicationDate(i: WithQn & { founder_name: string; founder_email: string }, dateLabel: string) {
  const b = await brandForQuestionnaire(i.questionnaire_id);
  return send("publication_date", i.founder_email, `Your ${b.name} interview: publication date`, [
    `Hi ${i.founder_name},`,
    `Thanks for approving your interview. It is scheduled to be published in ${b.name} on ${dateLabel}.`,
    "We'll let you know if anything changes.",
  ], undefined, i.id, undefined, b);
}
