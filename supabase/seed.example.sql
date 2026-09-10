-- Optional demo/bootstrap data for a NEW database.
-- Do NOT commit real employee records or production credentials here.

INSERT INTO departments(name, created_at) VALUES
  ('Management', now()::text),
  ('HR & Administration', now()::text),
  ('Operations', now()::text)
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings(key,value,updated_at) VALUES
  ('company_name','IntellRecurso International',now()::text),
  ('timezone','Asia/Dhaka',now()::text),
  ('office_start','09:00',now()::text),
  ('office_end','18:00',now()::text)
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at;

-- To bootstrap an admin on a fresh install:
-- 1) Generate a compatible password hash locally:
--      HRMS_ADMIN_PASSWORD='choose-a-strong-password' npm run hash-password
-- 2) Insert an employee (optional) and then insert a users row with that hash.
-- Never store the plaintext password in this file.
