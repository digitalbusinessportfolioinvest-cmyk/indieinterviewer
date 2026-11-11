/* eslint-disable @next/next/no-img-element */
import type { Edition } from "@/lib/edition";

export default function EditionView({ edition }: { edition: Edition }) {
  return (
    <div className="article">
      {edition.cover && <img className="edition-img" src={edition.cover.url} alt="Cover" />}
      {edition.blocks.map((b, k) =>
        b.type === "section" ? (
          <p key={k} className="section-label">{b.label}</p>
        ) : b.type === "image" ? (
          <img key={k} className="edition-img" src={b.image.url} alt={b.image.filename} />
        ) : (
          <section key={k}>
            <h2>{b.heading}</h2>
            <p className="pre">{b.answer}</p>
          </section>
        ),
      )}
    </div>
  );
}
