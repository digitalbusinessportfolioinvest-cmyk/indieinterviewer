import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
}

/** Lazily created shared Postgres client (so builds don't need DATABASE_URL). */
export function db(): Sql {
  if (!globalThis.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__sql = postgres(url, {
      max: 10,
      idle_timeout: 30,
      onnotice: () => {},
      // Keep DATE columns as plain "YYYY-MM-DD" strings (no timezone shifts).
      types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
    });
  }
  return globalThis.__sql;
}
