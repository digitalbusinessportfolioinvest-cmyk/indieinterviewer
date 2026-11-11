import { db } from "./db";
import { config } from "./config";

export type Brand = {
  slug: string;
  name: string;
  publisher: string;
  website: string | null;
  logo: string;
  senderName: string;
  replyTo: string;
  about: string;
};

const DEFAULT_LOGO = "/brand/horizontal_color.svg";

function fromRow(r: Record<string, unknown>): Brand {
  const name = String(r.name);
  return {
    slug: String(r.slug),
    name,
    publisher: String(r.publisher),
    website: (r.website as string | null) ?? null,
    logo: (r.logo as string | null) || DEFAULT_LOGO,
    senderName: (r.sender_name as string | null) || name,
    replyTo: (r.reply_to as string | null) || config.replyTo(),
    about: (r.about as string | null) || "a newsletter that publishes written interviews with founders",
  };
}

export async function brandForQuestionnaire(questionnaireId: number): Promise<Brand> {
  const [row] = await db()`
    SELECT n.* FROM newsletters n JOIN questionnaires q ON q.newsletter_id = n.id WHERE q.id = ${questionnaireId}`;
  if (!row) throw new Error(`No newsletter for questionnaire ${questionnaireId}`);
  return fromRow(row);
}

/** "Name <address>" using the configured sending address with this newsletter's display name. */
export function fromHeader(b: Brand) {
  const configured = config.mailFrom();
  const m = configured.match(/<([^>]+)>/);
  const address = m ? m[1] : configured;
  return `${b.senderName.replace(/[<>"]/g, "")} <${address}>`;
}
