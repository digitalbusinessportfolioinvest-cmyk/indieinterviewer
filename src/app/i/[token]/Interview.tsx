"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";

type State = {
  newsletter: { name: string; logo: string };
  founderName: string;
  status: string;
  messages: { id: number; role: string; kind: string; content: string }[];
  atClosing: boolean;
  openQuestion: { id: number; layer: string } | null;
  progress: {
    answered: number; total: number; layer: string;
    main: { done: number; total: number; minutesLeft: number };
    deep: { done: number; total: number; minutesLeft: number };
  };
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
        <div className="brand"><Logo /></div>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading your interview…</p>}
      </main>
    );
  }

  const finished = !["invited", "in_progress"].includes(state.status);

  const composerOpen = !finished && !state.atClosing && Boolean(state.openQuestion);
  return (
    <main className={composerOpen ? "wrap has-composer" : "wrap"}>
      <div className="brand">
        <Logo src={state.newsletter.logo} alt={state.newsletter.name} />
        <span>{state.newsletter.name} · Interview with {state.founderName}</span>
      </div>
      {!finished && <Progress p={state.progress} atClosing={state.atClosing} />}

      <div className="chat">
        {state.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>{m.content}</div>
        ))}
        {busy && !state.atClosing && <div className="typing">…</div>}
        {!finished && state.atClosing && <ChatUpload token={token} state={state} setState={setState} />}
      </div>

      {finished && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Thank you</h2>
          <p>Your interview has been submitted. We'll email you a copy to approve.</p>
        </div>
      )}

      {!finished && state.atClosing && <Review state={state} post={post} busy={busy} />}

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

function Review({ state, post, busy }: {
  state: State;
  post: (path: string, payload?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [value, setValue] = useState("");

  async function save(questionId: number) {
    const ok = await post("edit", { questionId, text: value });
    if (ok) setEditing(null);
  }

  let lastLayer = "";
  return (
    <div style={{ marginTop: 28 }}>
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
        <button onClick={() => post("finish")} disabled={busy || editing !== null}>{busy ? "Sending…" : "Finish"}</button>
      </div>
    </div>
  );
}

function ChatUpload({ token, state, setState }: { token: string; state: State; setState: (s: State) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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

  return (
    <div className="bubble founder chat-upload">
      <label className="btn" style={{ margin: 0, display: "inline-block", cursor: uploading ? "wait" : "pointer" }}>
        {uploading ? "Uploading…" : state.uploads.length ? "Add more images" : "Upload your photo"}
        <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} disabled={uploading} style={{ display: "none" }} />
      </label>
      <div className="small muted" style={{ marginTop: 8 }}>Your photo, logo, screenshots. Up to 10 images (PNG, JPG, WebP or GIF), 10 MB each.</div>
      {state.uploads.length > 0 && (
        <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {state.uploads.map((u) => <li key={u.id}>{u.filename} <span className="muted">({Math.ceil(u.size / 1024)} KB)</span></li>)}
        </ul>
      )}
      {uploadError && <p className="error">{uploadError}</p>}
    </div>
  );
}

function Progress({ p, atClosing }: { p: State["progress"]; atClosing: boolean }) {
  const { main, deep } = p;
  const all = Math.max(1, main.total + deep.total);
  const fill = (s: { done: number; total: number }) => `${Math.round((s.done / Math.max(1, s.total)) * 100)}%`;
  const fmt = (m: number) => (m <= 0 ? "done" : m <= 5 ? `about ${m} min` : `about ${Math.ceil(m / 5) * 5} min`);
  const left = main.minutesLeft + deep.minutesLeft;
  let note: string;
  if (atClosing) note = "All questions answered. Add your photo, review and click Finish.";
  else if (deep.minutesLeft > 0 && p.layer !== "deep") note = `${fmt(left)} left in total, ${fmt(main.minutesLeft)} without the optional Deep Dive.`;
  else note = `${fmt(left)} left.`;
  return (
    <div className="progress2" aria-label={note}>
      <div className="progress2-bar">
        <div className="seg main" style={{ flexGrow: main.total / all }}><div style={{ width: fill(main) }} /></div>
        <div className="seg deep" style={{ flexGrow: deep.total / all }}><div style={{ width: fill(deep) }} /></div>
      </div>
      <div className="progress2-labels small">
        <span style={{ flexGrow: main.total / all }}>Interview {main.done}/{main.total}</span>
        <span style={{ flexGrow: deep.total / all }}>Deep Dive (optional) {deep.done}/{deep.total}</span>
      </div>
      <div className="small muted">{note.charAt(0).toUpperCase() + note.slice(1)}</div>
    </div>
  );
}
