import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: 440 }}>
      <div className="brand"><b>IndieInterviewer</b></div>
      <div className="card">
        <h1>Sign in</h1>
        {error === "link" && <p className="error">That sign-in link has expired or was already used. Request a new one below.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
