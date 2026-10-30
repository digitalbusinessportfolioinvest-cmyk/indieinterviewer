"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

export default function RegisterPasskey() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function register() {
    setBusy(true);
    setError("");
    try {
      const res1 = await fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "register-options" }) });
      const options = await res1.json();
      if (!res1.ok) throw new Error(options.error);
      const response = await startRegistration({ optionsJSON: options });
      const res2 = await fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "register-verify", response }) });
      const body = await res2.json();
      if (!res2.ok) throw new Error(body.error);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The passkey was not created.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <p className="success">Passkey saved.</p>
        <a className="btn" href="/admin">Continue</a>
      </>
    );
  }
  return (
    <div className="row">
      <button onClick={register} disabled={busy}>Create passkey</button>
      <a className="btn secondary" href="/admin">Not now</a>
      {error && <p className="error" style={{ width: "100%" }}>{error}</p>}
    </div>
  );
}
