-- Operational throttling. Keys are HMACs of IPs and request categories; raw IPs are not stored.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  rate_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS request_rate_limits_window ON request_rate_limits(window_start);

-- Actions made by moderators require durable attribution for appeals and incident review.
CREATE TABLE IF NOT EXISTS moderation_audit (
  id TEXT PRIMARY KEY,
  moderator_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS moderation_audit_created ON moderation_audit(created_at DESC);
