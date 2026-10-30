"use client";

import { useActionState } from "react";
import { createInterview } from "./actions";

export default function CreateInterview({ newsletters }: { newsletters: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createInterview, null);
  return (
    <form action={action}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label htmlFor="founder_name">Founder name</label>
          <input id="founder_name" name="founder_name" type="text" required />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label htmlFor="founder_email">Founder email</label>
          <input id="founder_email" name="founder_email" type="email" required />
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label htmlFor="company">Business (optional)</label>
          <input id="company" name="company" type="text" />
        </div>
        {newsletters.length > 1 ? (
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="newsletter">Newsletter</label>
            <select id="newsletter" name="newsletter">
              {newsletters.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
            </select>
          </div>
        ) : (
          <input type="hidden" name="newsletter" value={newsletters[0]?.slug ?? "indie-hustle"} />
        )}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <label className="row" style={{ margin: 0, fontWeight: 400 }}>
          <input type="checkbox" name="send_email" defaultChecked /> Email the invitation now
        </label>
        <span className="spacer" />
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create interview"}</button>
      </div>
      {state && !state.ok && <p className="error">{state.message}</p>}
    </form>
  );
}
