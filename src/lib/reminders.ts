// One reminder email to founders who left the interview half done for a few days.
import { db } from "./db";
import { sendReminder } from "./emails";

const DAYS = Number(process.env.REMINDER_AFTER_DAYS || 3);

export async function sendDueReminders() {
  const sql = db();
  const due = await sql`
    SELECT i.id, i.questionnaire_id, i.founder_name, i.founder_email, i.token, i.current_position,
      (SELECT count(*)::int FROM questions q WHERE q.questionnaire_id = i.questionnaire_id) AS total,
      (SELECT count(*)::int FROM questions q WHERE q.questionnaire_id = i.questionnaire_id AND q.position < i.current_position) AS answered
    FROM interviews i
    WHERE i.status = 'in_progress' AND i.reminder_sent_at IS NULL AND i.founder_email <> ''
      AND COALESCE((SELECT max(m.created_at) FROM messages m WHERE m.interview_id = i.id AND m.role = 'founder'), i.started_at, i.updated_at)
          < now() - make_interval(days => ${DAYS})`;
  for (const i of due) {
    // Claim first so two instances never send the same reminder.
    const [claimed] = await sql`UPDATE interviews SET reminder_sent_at = now() WHERE id = ${i.id} AND reminder_sent_at IS NULL RETURNING id`;
    if (!claimed) continue;
    const r = await sendReminder(i as never, i.answered, i.total);
    if (!r.ok) await sql`UPDATE interviews SET reminder_sent_at = NULL WHERE id = ${i.id}`;
  }
  return due.length;
}
