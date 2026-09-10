BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK(role IN ('admin','hr','chairman','ceo','official','manager','employee'));

CREATE TABLE IF NOT EXISTS user_access (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  data_scope TEXT NOT NULL DEFAULT 'self' CHECK(data_scope IN ('self','team','all')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_access_user ON user_access(user_id);
ALTER TABLE user_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_access FROM anon, authenticated;

COMMIT;