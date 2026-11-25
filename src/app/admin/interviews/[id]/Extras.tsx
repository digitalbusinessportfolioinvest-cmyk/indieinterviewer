"use client";
import { useState, useTransition } from "react";
import { addAdminImage, resolveChangeRequest, saveIntro } from "../../actions";
import type { Intro } from "@/lib/llm";

type Msg = { ok: boolean; message: string } | null;

export function IntroEditor({ id, intro, editable }: { id: number; intro: Intro; editable: boolean }) {
  const [v, setV] = useState({
    title: intro.title, subtitle: intro.subtitle, hook: intro.hook, snapshot: intro.snapshot ?? "",
    teaser: intro.teaser ?? "", pullQuote: intro.pullQuote ?? "", bullets: intro.bullets.map((b) => b.text),
  });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (k: string, val: string) => { setV({ ...v, [k]: val }); setMsg(null); };
  const save = () => start(async () => setMsg(await saveIntro(id, v)));
  return (
    <div className="card">
      <h2>Intro</h2>
      {intro.titles.length > 1 && (
        <label className="small">Title options
          <select disabled={!editable} value="" onChange={(e) => { const t = intro.titles[Number(e.target.value)]; if (t) setV({ ...v, title: t.title, subtitle: t.subtitle }); }}>
            <option value="">Pick another option…</option>
            {intro.titles.map((t, k) => <option key={k} value={k}>{t.title}</option>)}
          </select>
        </label>
      )}
      <label className="small">Title<input type="text" value={v.title} disabled={!editable} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="small">Subtitle<input type="text" value={v.subtitle} disabled={!editable} onChange={(e) => set("subtitle", e.target.value)} /></label>
      <label className="small">Hook (first sentence in bold)<textarea rows={3} value={v.hook} disabled={!editable} onChange={(e) => set("hook", e.target.value)} /></label>
      {intro.snapshot !== undefined && <label className="small">Snapshot<input type="text" value={v.snapshot} disabled={!editable} onChange={(e) => set("snapshot", e.target.value)} /></label>}
      {intro.bullets.map((b, k) => (
        <label key={b.label} className="small">{b.label}
          <input type="text" value={v.bullets[k] ?? ""} disabled={!editable} onChange={(e) => { const bl = [...v.bullets]; bl[k] = e.target.value; setV({ ...v, bullets: bl }); setMsg(null); }} />
        </label>
      ))}
      {intro.teaser !== undefined && <label className="small">Deep Dive teaser<textarea rows={2} value={v.teaser} disabled={!editable} onChange={(e) => set("teaser", e.target.value)} /></label>}
      <label className="small">Pull quote (suggestion, not in the edition)<textarea rows={2} value={v.pullQuote} disabled={!editable} onChange={(e) => set("pullQuote", e.target.value)} /></label>
      {editable && (
        <p>
          <button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save intro"}</button>
          {msg && <span className={msg.ok ? "small muted" : "error"} style={{ marginLeft: 10 }}>{msg.message}</span>}
        </p>
      )}
    </div>
  );
}

export function ResolveRequest({ id, requestId }: { id: number; requestId: number }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return <span className="small muted">Done</span>;
  return <button className="secondary" disabled={pending} onClick={() => start(async () => { const r = await resolveChangeRequest(id, requestId); if (r.ok) setDone(true); })}>Mark as done</button>;
}

export function AdminImageUpload({ id }: { id: number }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card">
      <h2>Add images</h2>
      <p className="small muted">Photos or images the founder sent by email. They go into the edition like the founder&apos;s own, and you can place them below.</p>
      <label className="btn" style={{ display: "inline-block", cursor: pending ? "wait" : "pointer" }}>
        {pending ? "Uploading…" : "Upload image"}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={pending} onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const fd = new FormData();
          fd.append("file", f);
          start(async () => setMsg(await addAdminImage(id, fd)));
        }} />
      </label>
      {msg && <span className={msg.ok ? "small muted" : "error"} style={{ marginLeft: 10 }}>{msg.message}</span>}
    </div>
  );
}
