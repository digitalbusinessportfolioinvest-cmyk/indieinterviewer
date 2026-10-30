"use client";

import { useState } from "react";

export default function ApproveForm({ token, clause }: { token: string; clause: string }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/approve/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: checked }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Something went wrong. Please try again."); return; }
    window.location.reload();
  }

  return (
    <>
      <h2>Approve your interview</h2>
      <div className="clause">{clause}</div>
      <label className="row" style={{ fontWeight: 400, marginTop: 16 }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I have read and accept the text above.
      </label>
      <div style={{ marginTop: 12 }}>
        <button onClick={approve} disabled={!checked || busy}>{busy ? "Approving…" : "Approve"}</button>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>If something needs changing, reply to the email you received instead of approving.</p>
      {error && <p className="error">{error}</p>}
    </>
  );
}
