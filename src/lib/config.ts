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
  isProd: () => process.env.NODE_ENV === "production",
};

export function isAdminEmail(email: string) {
  return config.adminEmails().includes(email.trim().toLowerCase());
}
