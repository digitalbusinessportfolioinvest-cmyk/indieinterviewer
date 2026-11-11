"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useTransition } from "react";
import { savePhotoPlacement } from "../../actions";

type Photo = { id: number; filename: string; url: string; after: number | "none"; auto: boolean };
type Option = { questionId: number; heading: string };

export default function PhotoPlacer({ id, photos, options, editable }: { id: number; photos: Photo[]; options: Option[]; editable: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(photos.map((p) => [String(p.id), p.auto ? "auto" : String(p.after)])),
  );
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const label = (q: number | "none") => (q === "none" ? "not used" : `after "${options.find((o) => o.questionId === q)?.heading ?? q}"`);

  const save = () =>
    start(async () => {
      const placement: Record<string, number | "none" | "auto"> = {};
      for (const [k, v] of Object.entries(values)) placement[k] = v === "auto" || v === "none" ? v : Number(v);
      setMsg(await savePhotoPlacement(id, placement));
    });

  return (
    <div className="card">
      <h2>Photos in the edition</h2>
      <p className="small muted">Choose where each photo goes. It appears right after the answer you pick.</p>
      {photos.map((p) => (
        <div key={p.id} className="photo-row">
          <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.filename} /></a>
          <select
            value={values[String(p.id)]}
            disabled={!editable || pending}
            onChange={(e) => { setValues({ ...values, [String(p.id)]: e.target.value }); setMsg(null); }}
          >
            <option value="auto">Automatic ({label(p.auto ? p.after : "none")})</option>
            {options.map((o) => (
              <option key={o.questionId} value={String(o.questionId)}>After: {o.heading.length > 70 ? `${o.heading.slice(0, 70)}…` : o.heading}</option>
            ))}
            <option value="none">Don't use this photo</option>
          </select>
        </div>
      ))}
      {editable && (
        <p>
          <button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save photo placement"}</button>
          {msg && <span className={msg.ok ? "small muted" : "error"} style={{ marginLeft: 10 }}>{msg.message}</span>}
        </p>
      )}
    </div>
  );
}
