BEGIN;

ALTER TABLE performance_reviews
  ADD COLUMN IF NOT EXISTS source_task_id INTEGER UNIQUE REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_performance_source_task ON performance_reviews(source_task_id);

COMMIT;
