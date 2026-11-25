// Runs once when the server starts: checks every hour for founders who need a reminder.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./reminders-loop");
  }
}
