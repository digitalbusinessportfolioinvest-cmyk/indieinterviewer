import { notFound } from "next/navigation";
import { getInterviewByToken } from "@/lib/interview";
import Interview from "./Interview";

export const dynamic = "force-dynamic";

export default async function InterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const i = await getInterviewByToken(token);
  if (!i) notFound();
  return <Interview token={token} />;
}
