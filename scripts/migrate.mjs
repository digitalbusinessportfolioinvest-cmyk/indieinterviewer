import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { newsletters, questionnaires } from "./seed-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql.unsafe(readFileSync(join(here, "schema.sql"), "utf8"));

  for (const n of newsletters) {
    await sql`
      INSERT INTO newsletters (slug, name, publisher, website)
      VALUES (${n.slug}, ${n.name}, ${n.publisher}, ${n.website})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, website = EXCLUDED.website`;
  }

  for (const q of questionnaires) {
    const [nl] = await sql`SELECT id FROM newsletters WHERE slug = ${q.newsletter}`;
    const [existing] = await sql`
      SELECT id FROM questionnaires WHERE newsletter_id = ${nl.id} AND version = ${q.version}`;
    if (existing) {
      // Texts can be updated in place; questions are only inserted once so that
      // existing interviews keep pointing to stable question ids.
      await sql`
        UPDATE questionnaires SET welcome = ${q.welcome}, deep_dive_intro = ${q.deepDiveIntro},
          closing = ${q.closing}, rights_clause = ${q.rightsClause}
        WHERE id = ${existing.id}`;
      continue;
    }
    await sql.begin(async (tx) => {
      await tx`UPDATE questionnaires SET active = false WHERE newsletter_id = ${nl.id}`;
      const [qn] = await tx`
        INSERT INTO questionnaires (newsletter_id, version, active, welcome, deep_dive_intro, closing, rights_clause)
        VALUES (${nl.id}, ${q.version}, true, ${q.welcome}, ${q.deepDiveIntro}, ${q.closing}, ${q.rightsClause})
        RETURNING id`;
      let pos = 1;
      for (const item of q.questions) {
        await tx`
          INSERT INTO questions (questionnaire_id, position, layer, section, prompt, helper)
          VALUES (${qn.id}, ${pos}, ${item.layer}, ${item.section ?? null}, ${item.prompt}, ${item.helper ?? null})`;
        pos++;
      }
    });
    console.log(`Seeded questionnaire ${q.newsletter} ${q.version}`);
  }
  console.log("Migration complete");
} catch (err) {
  console.error("Migration failed", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
