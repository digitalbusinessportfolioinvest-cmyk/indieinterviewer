// Finds URLs and bare domains in the founder's answers, so they can be checked and linked in the edition.
const URL_RE = /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]|\b(?:[a-z0-9-]+\.)+(?:com|co|io|ai|app|dev|net|org|xyz|so|me|fyi|lol|site|tools|blog|news|info|us|uk|es|de|fr|tech|studio|page|link)\b(?:\/[^\s<>()"']*[^\s<>()"'.,;:!?])?/gi;

export function findLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    if (/@/.test(text.slice(Math.max(0, (m.index ?? 0) - 1), m.index))) continue; // part of an email address
    out.add(m[0]);
  }
  return [...out];
}

export function hrefFor(found: string) {
  return /^https?:\/\//i.test(found) ? found : `https://${found}`;
}

/** Splits text into plain and link parts (for rendering). */
export function linkParts(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const at = m.index ?? 0;
    if (text[at - 1] === "@") continue;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: m[0], href: hrefFor(m[0]) });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export type LinkCheck = { url: string; ok: boolean; status: string };

/** Loads each link once (8 s timeout) and reports whether it answers. */
export async function checkLinks(urls: string[]): Promise<LinkCheck[]> {
  return Promise.all(
    urls.slice(0, 20).map(async (u) => {
      const href = hrefFor(u);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(href, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; IndieInterviewer link check)" } });
        return { url: href, ok: res.status < 400, status: String(res.status) };
      } catch (err) {
        return { url: href, ok: false, status: err instanceof Error && err.name === "AbortError" ? "timeout" : "unreachable" };
      } finally {
        clearTimeout(t);
      }
    }),
  );
}
