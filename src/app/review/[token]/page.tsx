import { db } from "@/lib/db";
import { sendForApprovalOp } from "@/lib/admin-ops";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

async function approve(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const [row] = await db()`SELECT id FROM interviews WHERE review_token = ${token}`;
  if (!row) return;
  await sendForApprovalOp(row.id as number);
}

export default async function ReviewApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = token ? await db()`SELECT id, founder_name, company, status, deep_skipped_count, analysis FROM interviews WHERE review_token = ${token}` : [];
  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <div className="brand"><Logo /></div>
      <div className="card">
        {!row ? (
          <>
            <h1>Done</h1>
            <p>This link has already been used or is no longer valid. If the interview was sent, it's now waiting for the founder's approval; you can check it in the panel.</p>
            <p><a className="btn secondary" href="/admin">Open the panel</a></p>
          </>
        ) : (
          <>
            <h1>Send to {row.founder_name}?</h1>
            <p>The founder will receive the text of the interview to read and approve, with a note that the cover and their photos will be added in the published edition.</p>
            <form action={approve}>
              <input type="hidden" name="token" value={token} />
              <button type="submit">Approve and send to founder</button>
            </form>
            <p className="small muted" style={{ marginTop: 12 }}><a href={`/admin/interviews/${row.id}`}>Edit in the panel first</a></p>
          </>
        )}
      </div>
    </main>
  );
}
