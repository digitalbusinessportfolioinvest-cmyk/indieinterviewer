// Runs once when the server starts: checks every hour for founders who need a reminder.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { sendDueReminders } = await import("./lib/reminders");
  const run = () => sendDueReminders().catch((err) => console.error("[reminders]", err instanceof Error ? err.message : err));
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60 * 1000);
}
