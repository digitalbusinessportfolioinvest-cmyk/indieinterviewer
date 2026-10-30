import { requireAdmin } from "@/lib/auth";
import RegisterPasskey from "./RegisterPasskey";

export const dynamic = "force-dynamic";

export default async function PasskeyPage() {
  const email = await requireAdmin();
  return (
    <main className="wrap" style={{ maxWidth: 480 }}>
      <div className="brand"><b>IndieInterviewer</b><span>{email}</span></div>
      <div className="card">
        <h1>Set up a passkey</h1>
        <p>Next time you can sign in on this device with your fingerprint, face or device PIN, without waiting for an email.</p>
        <RegisterPasskey />
      </div>
    </main>
  );
}
