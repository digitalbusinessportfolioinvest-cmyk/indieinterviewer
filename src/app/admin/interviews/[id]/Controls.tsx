"use client";

import { useState, useTransition } from "react";
import { regenerateDraft, resendInvitation, setPublicationDate, type ActionResult } from "../../actions";

export function ActionButton({ kind, id, label }: { kind: "invite" | "regenerate"; id: number; label: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="row">
      <button
        className="secondary"
        disabled={pending}
        onClick={() => start(async () => setResult(await (kind === "invite" ? resendInvitation(id) : regenerateDraft(id))))}
      >
        {pending ? "Working…" : label}
      </button>
      {result && <span className={result.ok ? "success" : "error"} style={{ marginTop: 0 }}>{result.message}</span>}
    </span>
  );
}

export function PublicationDateForm({ id, current }: { id: number; current: string }) {
  const [date, setDate] = useState(current);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div>
      <label htmlFor="pubdate">Estimated publication date</label>
      <div className="row">
        <input id="pubdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} />
        <button disabled={pending || !date} onClick={() => start(async () => setResult(await setPublicationDate(id, date)))}>
          {pending ? "Sending…" : current ? "Send new date" : "Send date to founder"}
        </button>
      </div>
      {result && <p className={result.ok ? "success" : "error"}>{result.message}</p>}
    </div>
  );
}
