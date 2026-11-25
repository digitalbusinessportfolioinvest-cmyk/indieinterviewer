"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { Edition } from "@/lib/edition";
import { linkParts } from "@/lib/links";

function Linked({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, k) => (p.href ? <a key={k} href={p.href} target="_blank" rel="noreferrer">{p.text}</a> : <span key={k}>{p.text}</span>))}
    </>
  );
}

/** The edition as readers will see it. With `changeToken`, each answer gets a "Suggest a change" box for the founder. */
export default function EditionView({ edition, changeToken }: { edition: Edition; changeToken?: string }) {
  const intro = edition.intro;
  const [first, ...rest] = intro ? intro.hook.split(/(?<=[.!?])\s+/) : [""];
  return (
    <div className="article">
      {intro && (
        <header className="edition-head">
          <h1>{intro.title}</h1>
          {intro.subtitle && <p className="edition-sub">{intro.subtitle}</p>}
        </header>
      )}
      {edition.cover && <img className="edition-img" src={edition.cover.url} alt="Cover" />}
      {intro && (
        <div className="edition-intro">
          <p><strong>{first}</strong>{rest.length ? ` ${rest.join(" ")}` : ""}</p>
          {intro.snapshot && <p className="muted">Snapshot: {intro.snapshot}</p>}
          {intro.bullets.filter((b) => b.text).map((b) => (
            <p key={b.label}><strong>{b.label}:</strong> → {b.text}</p>
          ))}
          {intro.teaser && <p>{intro.teaser}</p>}
        </div>
      )}
      {edition.blocks.map((b, k) =>
        b.type === "section" ? (
          <p key={k} className="section-label">{b.label}</p>
        ) : b.type === "image" ? (
          <img key={k} className="edition-img" src={b.image.url} alt={b.image.filename} />
        ) : (
          <section key={k}>
            <h2>{b.heading}</h2>
            <p className="pre"><Linked text={b.answer} /></p>
            {changeToken && b.questionId && <SuggestChange token={changeToken} questionId={b.questionId} heading={b.heading} />}
          </section>
        ),
      )}
    </div>
  );
}

function SuggestChange({ token, questionId, heading }: { token: string; questionId: number; heading: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  if (state === "sent") return <p className="small muted">Thanks, we&apos;ve got your change for this answer. We&apos;ll send you the updated edition.</p>;
  if (!open) return <button type="button" className="link-btn small" onClick={() => setOpen(true)}>Suggest a change</button>;
  const send = async () => {
    setState("sending");
    const res = await fetch(`/api/approve/${token}/change`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId, heading, text }),
    }).catch(() => null);
    setState(res?.ok ? "sent" : "error");
  };
  return (
    <div className="change-box">
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us what to change in this answer, or paste the new text." />
      <div className="row">
        <button type="button" onClick={send} disabled={state === "sending" || text.trim().length < 3}>{state === "sending" ? "Sending…" : "Send this change"}</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {state === "error" && <p className="error">That didn&apos;t go through. Please try again.</p>}
    </div>
  );
}
