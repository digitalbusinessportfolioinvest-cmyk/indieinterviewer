// Estimated publication window: the next free issue day in the newsletter's calendar, plus two weeks of margin.
import { db } from "./db";

const DAY = 86_400_000;
const MARGIN_DAYS = 14;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function formatDay(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Slot for this interview: issue days from max(launch, tomorrow) on, skipping dates already taken, in finishing order
 *  of the interviews still waiting (in review, awaiting approval or approved without a date). */
export async function estimatePublication(interviewId: number): Promise<{ from: string; to: string } | null> {
  const sql = db();
  const [n] = await sql`
    SELECT n.id, n.publish_weekday, n.launch_date FROM interviews i
    JOIN questionnaires q ON q.id = i.questionnaire_id JOIN newsletters n ON n.id = q.newsletter_id
    WHERE i.id = ${interviewId}`;
  if (!n || n.publish_weekday === null) return null;
  const taken = new Set(
    (await sql`
      SELECT i.publication_date FROM interviews i JOIN questionnaires q ON q.id = i.questionnaire_id
      WHERE q.newsletter_id = ${n.id} AND i.publication_date IS NOT NULL AND i.status IN ('scheduled', 'published')`)
      .map((r) => String(r.publication_date instanceof Date ? iso(r.publication_date) : r.publication_date).slice(0, 10)),
  );
  const waiting = await sql`
    SELECT i.id FROM interviews i JOIN questionnaires q ON q.id = i.questionnaire_id
    WHERE q.newsletter_id = ${n.id} AND i.publication_date IS NULL
      AND (i.status IN ('in_review', 'awaiting_approval', 'approved') OR i.id = ${interviewId})
    ORDER BY i.completed_at NULLS LAST, i.id`;
  const position = waiting.findIndex((r) => r.id === interviewId);
  if (position < 0) return null;

  const tomorrow = new Date(Date.now() + DAY);
  const launch = n.launch_date ? new Date(`${String(n.launch_date instanceof Date ? iso(n.launch_date) : n.launch_date).slice(0, 10)}T12:00:00Z`) : null;
  let d = new Date(`${iso(launch && launch > tomorrow ? launch : tomorrow)}T12:00:00Z`);
  while (d.getUTCDay() !== n.publish_weekday) d = new Date(d.getTime() + DAY);
  let free = -1;
  for (let guard = 0; guard < 520; guard++, d = new Date(d.getTime() + 7 * DAY)) {
    if (taken.has(iso(d))) continue;
    free++;
    if (free === position) return { from: iso(d), to: iso(new Date(d.getTime() + MARGIN_DAYS * DAY)) };
  }
  return null;
}
