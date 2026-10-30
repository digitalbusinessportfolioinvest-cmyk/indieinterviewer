import { layout, sendEmail, textWithLink } from "./email";
import { config } from "./config";

function send(kind: string, to: string | string[], subject: string, paragraphs: string[], button?: { label: string; url: string }, interviewId?: number, idempotencyKey?: string) {
  return sendEmail({
    kind,
    to,
    subject,
    text: textWithLink(paragraphs, button),
    html: layout(paragraphs, button),
    interviewId,
    idempotencyKey,
  });
}

export function sendMagicLink(email: string, url: string) {
  return send("magic_link", email, "Your IndieInterviewer sign-in link", [
    "Use the button below to sign in to IndieInterviewer. The link works once and expires in 20 minutes.",
    "If you didn't ask for it, you can ignore this email.",
  ], { label: "Sign in", url });
}

export function sendInvitation(i: { id: number; founder_name: string; founder_email: string; token: string }) {
  const url = `${config.appUrl()}/i/${i.token}`;
  return send("invitation", i.founder_email, "Your Indie Hustle interview", [
    `Hi ${i.founder_name},`,
    "Thanks for agreeing to be interviewed for Indie Hustle. The interview runs on the page below: the questions come one at a time, everything you write is saved as you go, and you can pause and come back to it whenever you like using the same link.",
  ], { label: "Start the interview", url }, i.id, `invite-${i.id}-${i.token.slice(0, 8)}`);
}

export function sendCompletedToAdmins(i: { id: number; founder_name: string; company: string | null; deep_skipped_count: number }) {
  const url = `${config.appUrl()}/admin/interviews/${i.id}`;
  const deep = i.deep_skipped_count > 0
    ? `The founder skipped ${i.deep_skipped_count} Deep Dive question(s), so this one needs an analysis.`
    : "The founder answered every Deep Dive question.";
  return send("completed", config.adminEmails(), `Interview finished: ${i.founder_name}${i.company ? ` (${i.company})` : ""}`, [
    `${i.founder_name} has finished the interview.`,
    deep,
    "The draft with the rewritten question headings is being generated and will be ready for review in a few minutes.",
  ], { label: "Review the interview", url }, i.id, `completed-${i.id}`);
}

export function sendApprovalRequest(i: { id: number; founder_name: string; founder_email: string; approval_token: string }) {
  const url = `${config.appUrl()}/approve/${i.approval_token}`;
  return send("approval_request", i.founder_email, "Your Indie Hustle interview is ready for your approval", [
    `Hi ${i.founder_name},`,
    "Your interview is ready. Please read it on the page below and, if everything reflects your answers, approve it there.",
    "If anything needs changing, just reply to this email and tell us what.",
  ], { label: "Read and approve", url }, i.id);
}

export function sendApprovedToAdmins(i: { id: number; founder_name: string; company: string | null }) {
  const url = `${config.appUrl()}/admin/interviews/${i.id}`;
  return send("approved", config.adminEmails(), `Approved: ${i.founder_name}${i.company ? ` (${i.company})` : ""}`, [
    `${i.founder_name} has approved the interview and accepted the rights clause.`,
    "The next step is to send them the estimated publication date.",
  ], { label: "Open the interview", url }, i.id, `approved-${i.id}`);
}

export function sendPublicationDate(i: { id: number; founder_name: string; founder_email: string }, dateLabel: string) {
  return send("publication_date", i.founder_email, "Your Indie Hustle interview: publication date", [
    `Hi ${i.founder_name},`,
    `Thanks for approving your interview. It is scheduled to be published in Indie Hustle on ${dateLabel}.`,
    "We'll let you know if anything changes.",
  ], undefined, i.id);
}
