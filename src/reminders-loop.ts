import { sendDueReminders } from "./lib/reminders";

if (process.env.DATABASE_URL) {
  const run = () => sendDueReminders().catch((err) => console.error("[reminders]", err instanceof Error ? err.message : err));
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60 * 1000);
}
