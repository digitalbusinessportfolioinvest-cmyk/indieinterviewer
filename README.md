# IndieInterviewer

Internal tool for running written founder interviews for Indie Hustle (and, later, other newsletters).

## Flow

1. An admin creates an interview (founder name and email) and sends the invitation link.
2. The founder answers the public questions one at a time. After each answer the model decides whether to ask a follow-up (at most two per question, the second more courteous). Answers are saved before any model call, so the interview can be paused and resumed with the same link.
3. The Deep Dive section is optional: replying `skip` skips a question.
4. At the end the founder uploads images, reviews and edits every answer, and clicks Finish.
5. A draft is generated: answers are copied verbatim and only the question headings are rewritten for that founder, avoiding headings used in recent issues.
6. The admin reviews the draft, writes an analysis if Deep Dive questions were skipped, and sends it to the founder.
7. The founder approves on a page that shows the rights clause. The accepted text, timestamp, email and IP are stored.
8. The admin sends the estimated publication date.

## Admin access

Admins are listed in `ADMIN_EMAILS`. The first sign-in on a device uses an emailed link; after that the admin can register a passkey and sign in with it.

## Stack

Next.js 15, Postgres (`postgres` driver, plain SQL), S3-compatible storage for uploads, OpenRouter for the model, Resend for email. `npm start` runs the idempotent migration and seed (`scripts/migrate.mjs`) before starting the server.

## Configuration

See `.env.example`.
