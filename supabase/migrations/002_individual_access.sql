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

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id,is_read,created_at);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notifications FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT,
  location TEXT,
  description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON events FROM anon, authenticated;

COMMIT;