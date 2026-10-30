"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State = {
  founderName: string;
  status: string;
  messages: { id: number; role: string; kind: string; content: string }[];
  atClosing: boolean;
  openQuestion: { id: number; layer: string } | null;
  progress: { answered: number; total: number; layer: string };
  review: { questionId: number; layer: string; section: string | null; prompt: string; text: string; skipped: boolean }[];
  uploads: { id: number; filename: string; size: number }[];
};

function draftKey(token: string) {
  return `ii-draft-${token}`;
}
function readDraft(token: string) {
  try { return localStorage.getItem(draftKey(token)) ?? ""; } catch { return ""; }
}
function writeDraft(token: string, value: string) {
  try {
    if (value) localStorage.setItem(draftKey(token), value);
    else localStorage.removeItem(draftKey(token));
  } catch { /* storage unavailable */ }
}

export default function Interview({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/i/${token}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "Something went wrong."); return; }
    setState(body);
  }, [token]);

  useEffect(() => { load(); setText(readDraft(token)); }, [load, token]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [state?.messages.length, busy]);

  async function post(path: string, payload?: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/i/${token}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Something went wrong. Please try again."); return false; }
      setState(body);
      return true;
    } catch {
      setError("Connection problem. Your answer was not sent; please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    const ok = await post("answer", { text: value });
    if (ok) { setText(""); writeDraft(token, ""); }
  }

  if (!state) {
    return (
      <main className="wrap">
        <div className="brand"><b>Indie Hustle</b></div>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading your interview…</p>}
      </main>
    );
  }

  const finished = !["invited", "in_progress"].includes(state.status);
  const pct = Math.round((state.progress.answered / Math.max(1, state.progress.total)) * 100);

  return (
    <main className="wrap">
      <div className="brand">
        <b>Indie Hustle</b>
        <span>Interview with {state.founderName}</span>
      </div>
      {!finished && <div className="progress" aria-label={`${pct}% complete`}><div style={{ width: `${pct}%` }} /></div>}

      <div className="chat">
        {state.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>{m.content}</div>
        ))}
        {busy && !state.atClosing && <div className="typing">…</div>}
      </div>

      {finished && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Thank you</h2>
          <p>Your interview has been submitted. We'll email you a copy to approve.</p>
        </div>
      )}

      {!finished && state.atClosing && <Review token={token} state={state} setState={setState} post={post} busy={busy} />}

      <div ref={bottom} />

      {!finished && !state.atClosing && state.openQuestion && (
        <div className="composer">
          <div className="inner">
            <textarea
              value={text}
              placeholder="Write your answer…"
              onChange={(e) => { setText(e.target.value); writeDraft(token, e.target.value); }}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }}
              disabled={busy}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted small">
                {state.openQuestion.layer === "deep" ? 'Optional: reply "skip" to skip this question. ' : ""}
                Saved as you go. You can close this page and come back with the same link.
              </span>
              <span className="spacer" />
              <button onClick={send} disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send"}</button>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
      {error && (finished || state.atClosing) && <p className="error">{error}</p>}
    </main>
  );
}

function Review({ token, state, setState, post, busy }: {
  token: string;
  state: State;
  setState: (s: State) => void;
  post: (path: string, payload?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function save(questionId: number) {
    const ok = await post("edit", { questionId, text: value });
    if (ok) setEditing(null);
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/i/${token}/upload`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setUploadError(`${file.name}: ${body.error ?? "upload failed"}`); break; }
      setState(body);
    }
    setUploading(false);
  }

  let lastLayer = "";
  return (
    <div style={{ marginTop: 28 }}>
      <div className="card">
        <h2>Add images</h2>
        <p className="muted small">Screenshots, dashboards, product shots, your logo and a photo of yourself. Images or PDF, up to 10 MB each.</p>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf" onChange={(e) => upload(e.target.files)} disabled={uploading} />
        {uploading && <p className="muted small">Uploading…</p>}
        {uploadError && <p className="error">{uploadError}</p>}
        {state.uploads.length > 0 && (
          <ul className="small">
            {state.uploads.map((u) => <li key={u.id}>{u.filename} <span className="muted">({Math.ceil(u.size / 1024)} KB)</span></li>)}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Review your answers</h2>
        <p className="muted small">You can edit any answer before finishing.</p>
        {state.review.map((r) => {
          const header = r.layer !== lastLayer ? (r.layer === "deep" ? "Deep Dive" : r.layer === "closing" ? "Closing" : "Interview") : null;
          lastLayer = r.layer;
          return (
            <div key={r.questionId} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
              {header && <p className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{header}</p>}
              <h3>{r.section ? `${r.section}: ` : ""}{r.prompt}</h3>
              {editing === r.questionId ? (
                <>
                  <textarea value={value} onChange={(e) => setValue(e.target.value)} />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button onClick={() => save(r.questionId)} disabled={busy}>Save</button>
                    <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="pre">{r.skipped || !r.text ? <span className="muted">Skipped</span> : r.text}</p>
                  <button className="secondary" onClick={() => { setEditing(r.questionId); setValue(r.text); }}>Edit</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <p>When you're happy with everything, click Finish to send the interview.</p>
        <button onClick={() => post("finish")} disabled={busy || uploading || editing !== null}>{busy ? "Sending…" : "Finish"}</button>
      </div>
    </div>
  );
}
