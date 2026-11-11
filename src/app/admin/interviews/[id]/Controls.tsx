"use client";

import { useState, useTransition } from "react";
import { deleteInterview, regenerateDraft, resendInvitation, setPublicationDate, setPublished, type ActionResult } from "../../actions";

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

export function DeleteInterview({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div>
      <button
        className="danger"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete the interview with ${name}? Answers, messages and uploaded files will be removed permanently.`)) return;
          start(async () => { const r = await deleteInterview(id); if (r) setResult(r); });
        }}
      >
        {pending ? "Deleting…" : "Delete interview"}
      </button>
      {result && !result.ok && <p className="error">{result.message}</p>}
    </div>
  );
}

export function PublishedToggle({ id, published }: { id: number; published: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="row">
      <button className={published ? "secondary" : undefined} disabled={pending} onClick={() => start(async () => setResult(await setPublished(id, !published)))}>
        {pending ? "Saving…" : published ? "Undo: not published yet" : "Mark as published"}
      </button>
      {result && <span className={result.ok ? "success" : "error"} style={{ marginTop: 0 }}>{result.message}</span>}
    </span>
  );
}
