-- My Petition 0.2: guests, verified contact, signatures, moderation and participation.
ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE proposals ADD COLUMN author_name_override TEXT;
ALTER TABLE proposals ADD COLUMN visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden'));
ALTER TABLE proposals ADD COLUMN local_only INTEGER NOT NULL DEFAULT 0 CHECK (local_only IN (0,1));
ALTER TABLE proposals ADD COLUMN locality TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE votes ADD COLUMN public_name TEXT;
ALTER TABLE comments ADD COLUMN public_name TEXT;
ALTER TABLE comments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden'));

CREATE TABLE IF NOT EXISTS guest_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_sessions_expires ON guest_sessions(expires_at);

CREATE TABLE IF NOT EXISTS verified_emails (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  verified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS email_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS email_challenge_actor ON email_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_challenge_address ON email_challenges(email, created_at DESC);

CREATE TABLE IF NOT EXISTS email_rate_limits (
  rate_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  document_hash TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  show_name INTEGER NOT NULL DEFAULT 0 CHECK(show_name IN (0,1)),
  signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (proposal_id, user_id),
  UNIQUE (proposal_id, signer_email)
);
CREATE INDEX IF NOT EXISTS signatures_proposal ON signatures(proposal_id, signed_at DESC);

CREATE TABLE IF NOT EXISTS saved_proposals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id,proposal_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id TEXT REFERENCES proposals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('comment','signature','moderation','verification')),
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('proposal','comment')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('spam','harassment','privacy','illegal','other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','actioned')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(reporter_id,target_type,target_id)
);
CREATE INDEX IF NOT EXISTS reports_queue ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS location_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locality TEXT NOT NULL,
  region TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  verification_method TEXT NOT NULL DEFAULT '',
  evidence_reference TEXT NOT NULL DEFAULT '',
  moderator_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS location_verifications_queue ON location_verifications(status, requested_at DESC);
