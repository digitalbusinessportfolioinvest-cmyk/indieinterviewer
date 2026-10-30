"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function passkey() {
    setBusy(true);
    setError("");
    try {
      const options = await fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "login-options" }) }).then((r) => r.json());
      const response = await startAuthentication({ optionsJSON: options });
      const res = await fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "login-verify", response }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      window.location.href = "/admin";
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Passkey sign-in was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function magic(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    await fetch("/api/auth/magic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setBusy(false);
    setSent(true);
  }

  return (
    <>
      <button onClick={passkey} disabled={busy} style={{ width: "100%" }}>Sign in with passkey</button>
      <p className="muted small" style={{ margin: "20px 0 4px" }}>First time on this device? Get a sign-in link by email.</p>
      {sent ? (
        <p className="success">If that address has access, a sign-in link is on its way. It expires in 20 minutes.</p>
      ) : (
        <form onSubmit={magic}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="secondary" disabled={busy}>Email me a link</button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}
