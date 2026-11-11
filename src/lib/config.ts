export const config = {
  appUrl: () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  adminEmails: () =>
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  mailFrom: () => process.env.MAIL_FROM || "Indie Hustle <interviews@send.indieinterviewer.com>",
  replyTo: () => process.env.REPLY_TO || "the@indiehustle.co",
  model: () => process.env.OPENROUTER_MODEL || "anthropic/claude-opus-5.5",
  /** Max model spend (USD, as reported by OpenRouter) across the whole app in any rolling hour. */
  llmHourlyBudgetUsd: () => Number(process.env.LLM_HOURLY_BUDGET_USD || "2"),
  /** Max model calls per interview in any rolling hour. */
  llmCallsPerInterviewHour: () => Number(process.env.LLM_CALLS_PER_INTERVIEW_HOUR || "40"),
  /** Max founder messages per interview in any rolling hour. */
  answersPerInterviewHour: () => Number(process.env.ANSWERS_PER_INTERVIEW_HOUR || "60"),
  isProd: () => process.env.NODE_ENV === "production",
};

export function isAdminEmail(email: string) {
  return config.adminEmails().includes(email.trim().toLowerCase());
}
