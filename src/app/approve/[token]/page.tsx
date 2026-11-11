import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getQuestionnaire, type Interview } from "@/lib/interview";
import ArticleView from "@/components/ArticleView";
import ApproveForm from "./ApproveForm";
import Logo from "@/components/Logo";
import { brandForQuestionnaire } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db()`SELECT * FROM interviews WHERE approval_token = ${token}`;
  const i = row as unknown as Interview | undefined;
  if (!i || !i.draft || !["awaiting_approval", "approved", "scheduled", "published"].includes(i.status)) notFound();
  const [qn, brand] = await Promise.all([getQuestionnaire(i.questionnaire_id), brandForQuestionnaire(i.questionnaire_id)]);
  const approved = i.status !== "awaiting_approval";

  return (
    <main className="wrap">
      <div className="brand"><Logo src={brand.logo} alt={brand.name} /><span>{brand.name} · Interview with {i.founder_name}</span></div>
      <div className="card">
        <p className="muted small">Please read your interview below. This is the version we will publish.</p>
        <ArticleView draft={i.draft} analysis={i.analysis} />
      </div>
      <div className="card">
        {approved ? (
          <>
            <h2>Approved</h2>
            <p>Thank you. You approved this interview{i.approved_at ? ` on ${new Date(i.approved_at).toUTCString()}` : ""}. We'll send you the estimated publication date by email.</p>
          </>
        ) : (
          <ApproveForm token={token} clause={qn.rights_clause} />
        )}
      </div>
    </main>
  );
}
