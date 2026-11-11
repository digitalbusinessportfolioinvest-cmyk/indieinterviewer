CREATE TABLE IF NOT EXISTS newsletters (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  publisher TEXT NOT NULL,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questionnaires (
  id SERIAL PRIMARY KEY,
  newsletter_id INT NOT NULL REFERENCES newsletters(id),
  version TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  welcome TEXT NOT NULL,
  deep_dive_intro TEXT NOT NULL,
  closing TEXT NOT NULL,
  rights_clause TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (newsletter_id, version)
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  questionnaire_id INT NOT NULL REFERENCES questionnaires(id),
  position INT NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('public', 'deep', 'closing')),
  section TEXT,
  prompt TEXT NOT NULL,
  helper TEXT,
  UNIQUE (questionnaire_id, position)
);

CREATE TABLE IF NOT EXISTS interviews (
  id SERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  approval_token TEXT UNIQUE NOT NULL,
  questionnaire_id INT NOT NULL REFERENCES questionnaires(id),
  founder_name TEXT NOT NULL,
  founder_email TEXT NOT NULL,
  company TEXT,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','in_progress','completed','in_review','awaiting_approval','approved','scheduled')),
  current_position INT NOT NULL DEFAULT 1,
  deep_intro_shown BOOLEAN NOT NULL DEFAULT false,
  deep_skipped_count INT NOT NULL DEFAULT 0,
  analysis TEXT,
  draft JSONB,
  draft_status TEXT NOT NULL DEFAULT 'none' CHECK (draft_status IN ('none','generating','ready','failed')),
  approval_clause TEXT,
  approval_email TEXT,
  approval_ip TEXT,
  approved_at TIMESTAMPTZ,
  publication_date DATE,
  invited_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sent_for_approval_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS answers (
  id SERIAL PRIMARY KEY,
  interview_id INT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES questions(id),
  text TEXT NOT NULL DEFAULT '',
  skipped BOOLEAN NOT NULL DEFAULT false,
  followups_used INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, question_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  interview_id INT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question_id INT REFERENCES questions(id),
  role TEXT NOT NULL CHECK (role IN ('interviewer','founder')),
  kind TEXT NOT NULL CHECK (kind IN ('welcome','question','followup','answer','deep_intro','closing','note')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_interview_idx ON messages (interview_id, id);

CREATE TABLE IF NOT EXISTS uploads (
  id SERIAL PRIMARY KEY,
  interview_id INT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  interview_id INT REFERENCES interviews(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  to_email TEXT NOT NULL,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_passkeys (
  credential_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Per-newsletter branding (added for multiple interview processes).
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS reply_to TEXT;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS about TEXT;
