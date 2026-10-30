"use client";

import { useState, useTransition } from "react";
import type { DraftItem } from "@/lib/interview";
import { regenerateDraft, saveReview, sendForApproval, type ActionResult } from "../../actions";

export default function ReviewEditor(props: {
  id: number;
  items: DraftItem[];
  analysis: string;
  needsAnalysis: boolean;
  editable: boolean;
  markdown: string;
  status: string;
  canRegenerate: boolean;
}) {
  const [items, setItems] = useState(props.items.map((i) => ({ questionId: i.questionId, layer: i.layer, section: i.section, original: i.original, heading: i.heading, answer: i.answer })));
  const [analysis, setAnalysis] = useState(props.analysis);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [copied, setCopied] = useState(false);

  function update(qid: number, field: "heading" | "answer", value: string) {
    setItems((prev) => prev.map((it) => (it.questionId === qid ? { ...it, [field]: value } : it)));
    setDirty(true);
  }

  function save() {
    start(async () => {
      const r = await saveReview(props.id, items.map(({ questionId, heading, answer }) => ({ questionId, heading, answer })), analysis);
      setResult(r);
      if (r.ok) setDirty(false);
    });
  }

  function send() {
    start(async () => {
      if (dirty) {
        const s = await saveReview(props.id, items.map(({ questionId, heading, answer }) => ({ questionId, heading, answer })), analysis);
        if (!s.ok) { setResult(s); return; }
        setDirty(false);
      }
      setResult(await sendForApproval(props.id));
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  let lastLayer = "";
  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Draft</h2>
        <span className="spacer" />
        <button className="secondary" onClick={copy}>{copied ? "Copied" : "Copy as Markdown"}</button>
        {props.canRegenerate && (
          <button className="secondary" disabled={pending} onClick={() => start(async () => { const r = await regenerateDraft(props.id); setResult(r); if (r.ok) window.location.reload(); })}>
            Rewrite headings again
          </button>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Headings were rewritten for this founder; the answers are exactly as written. The original question is shown under each heading.</p>

      {items.map((it) => {
        const header = it.layer !== lastLayer ? (it.layer === "deep" ? "Deep Dive" : it.layer === "closing" ? "Closing" : "Interview") : null;
        lastLayer = it.layer;
        return (
          <div key={it.questionId} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            {header && <p className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{header}</p>}
            {props.editable ? (
              <input type="text" value={it.heading} onChange={(e) => update(it.questionId, "heading", e.target.value)} style={{ fontWeight: 700 }} />
            ) : (
              <h3>{it.heading}</h3>
            )}
            <p className="small muted" style={{ margin: "4px 0 8px" }}>Original: {it.section ? `${it.section}: ` : ""}{it.original}</p>
            {props.editable ? (
              <textarea value={it.answer} onChange={(e) => update(it.questionId, "answer", e.target.value)} rows={Math.min(18, Math.max(4, Math.ceil(it.answer.length / 90)))} />
            ) : (
              <p className="pre">{it.answer}</p>
            )}
          </div>
        );
      })}

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 16 }}>
        <h3>Analysis {props.needsAnalysis ? <span className="pill">Required: Deep Dive skipped</span> : <span className="muted small">(optional)</span>}</h3>
        {props.editable ? (
          <textarea value={analysis} onChange={(e) => { setAnalysis(e.target.value); setDirty(true); }} rows={10} placeholder="Your analysis of the business, shown in the Deep Dive section." />
        ) : (
          <p className="pre">{analysis || <span className="muted">None</span>}</p>
        )}
      </div>

      {props.editable && (
        <div className="row" style={{ marginTop: 16 }}>
          <button className="secondary" onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
          <span className="spacer" />
          <button onClick={send} disabled={pending}>
            {props.status === "awaiting_approval" ? "Send updated version to founder" : "Send to founder for approval"}
          </button>
        </div>
      )}
      {result && <p className={result.ok ? "success" : "error"}>{result.message}</p>}
    </div>
  );
}
