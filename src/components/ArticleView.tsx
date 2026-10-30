import type { Draft } from "@/lib/interview";

export function splitDraft(draft: Draft) {
  return {
    pub: draft.items.filter((i) => i.layer === "public"),
    deep: draft.items.filter((i) => i.layer === "deep"),
    closing: draft.items.filter((i) => i.layer === "closing"),
  };
}

export default function ArticleView({ draft, analysis }: { draft: Draft; analysis: string | null }) {
  const { pub, deep, closing } = splitDraft(draft);
  return (
    <div className="article">
      {pub.map((it) => (
        <section key={it.questionId}>
          <h2>{it.heading}</h2>
          <p className="pre">{it.answer}</p>
        </section>
      ))}
      {(deep.length > 0 || analysis) && <p className="section-label">Deep Dive</p>}
      {deep.map((it) => (
        <section key={it.questionId}>
          <h2>{it.heading}</h2>
          <p className="pre">{it.answer}</p>
        </section>
      ))}
      {analysis && (
        <section>
          <h2>Analysis</h2>
          <p className="pre">{analysis}</p>
        </section>
      )}
      {closing.map((it) => (
        <section key={it.questionId}>
          <h2>{it.heading}</h2>
          <p className="pre">{it.answer}</p>
        </section>
      ))}
    </div>
  );
}

export function draftToMarkdown(draft: Draft, analysis: string | null) {
  const { pub, deep, closing } = splitDraft(draft);
  const block = (h: string, a: string) => `## ${h}\n\n${a.trim()}\n`;
  const parts = pub.map((i) => block(i.heading, i.answer));
  if (deep.length || analysis) parts.push("---\n\n# Deep Dive\n");
  parts.push(...deep.map((i) => block(i.heading, i.answer)));
  if (analysis) parts.push(block("Analysis", analysis));
  parts.push(...closing.map((i) => block(i.heading, i.answer)));
  return parts.join("\n");
}
