-- Tamper-evident server HMAC for new electronic signatures.
-- Existing signatures remain unsealed; do not mislabel them as verified.
ALTER TABLE signatures ADD COLUMN audit_mac TEXT;
