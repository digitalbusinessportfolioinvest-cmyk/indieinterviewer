import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/status";
import AdminHeader from "./AdminHeader";
import CreateInterview from "./CreateInterview";

export const dynamic = "force-dynamic";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const email = await requireAdmin();
  const { notice } = await searchParams;
  const sql = db();
  const [rows, newsletters, queue] = await Promise.all([
    sql`
      SELECT i.id, i.founder_name, i.company, i.status, i.deep_skipped_count, i.created_at, i.completed_at, n.name AS newsletter
      FROM interviews i JOIN questionnaires q ON q.id = i.questionnaire_id JOIN newsletters n ON n.id = q.newsletter_id
      ORDER BY i.created_at DESC LIMIT 300`,
    sql`SELECT slug, name FROM newsletters ORDER BY id`,
    sql`
      SELECT i.id, i.founder_name, i.company, i.status, i.publication_date, n.name AS newsletter
      FROM interviews i JOIN questionnaires q ON q.id = i.questionnaire_id JOIN newsletters n ON n.id = q.newsletter_id
      WHERE i.status IN ('approved', 'scheduled')
      ORDER BY n.id, i.publication_date NULLS LAST, i.approved_at NULLS LAST, i.id`,
  ]);
  const queueByNewsletter = new Map<string, typeof queue>();
  for (const r of queue) {
    const k = r.newsletter as string;
    if (!queueByNewsletter.has(k)) queueByNewsletter.set(k, [] as unknown as typeof queue);
    queueByNewsletter.get(k)!.push(r);
  }
  return (
    <main className="wrap wide">
      <AdminHeader email={email} />
      {notice === "deleted" && <p className="success" style={{ marginBottom: 16 }}>Interview deleted.</p>}
      <div className="card">
        <h2>New interview</h2>
        <CreateInterview newsletters={newsletters.map((n) => ({ slug: n.slug as string, name: n.name as string }))} />
      </div>
      <div className="card">
        <h2>Publication queue</h2>
        {queue.length === 0 ? (
          <p className="muted">No approved interviews waiting to be published.</p>
        ) : (
          [...queueByNewsletter.entries()].map(([name, items]) => (
            <div key={name} style={{ marginBottom: 16 }}>
              <h3>{name}</h3>
              <table>
                <thead><tr><th>Founder</th><th>Publication date</th><th>Status</th></tr></thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td><a href={`/admin/interviews/${r.id}`}><b>{r.founder_name}</b></a>{r.company ? <span className="muted"> · {r.company}</span> : null}</td>
                      <td>{r.publication_date ? new Date(`${r.publication_date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : <span className="muted">No date yet</span>}</td>
                      <td><span className="pill">{STATUS_LABELS[r.status] ?? r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
      <div className="card">
        <h2>Interviews</h2>
        {rows.length === 0 ? (
          <p className="muted">No interviews yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Founder</th><th>Newsletter</th><th>Status</th><th>Created</th><th>Finished</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><a href={`/admin/interviews/${r.id}`}><b>{r.founder_name}</b></a>{r.company ? <span className="muted"> · {r.company}</span> : null}</td>
                  <td>{r.newsletter}</td>
                  <td>
                    <span className="pill">{STATUS_LABELS[r.status] ?? r.status}</span>
                    {r.deep_skipped_count > 0 && r.completed_at ? <span className="pill" style={{ marginLeft: 6 }}>Needs analysis</span> : null}
                  </td>
                  <td className="muted">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="muted">{r.completed_at ? new Date(r.completed_at).toLocaleDateString("en-GB") : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
