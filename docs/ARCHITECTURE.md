# Architecture

Browser
  -> Vercel static frontend
  -> same-origin /api/* request
  -> Vercel external rewrite
  -> Supabase Edge Function: hrms-api
  -> Supabase PostgreSQL

Authentication uses an HttpOnly, Secure, SameSite=Lax session cookie. Passwords are stored as scrypt hashes. The Edge Function receives `SUPABASE_DB_URL` from Supabase automatically; no database password is exposed to the browser or committed to Git.

The PostgreSQL tables have RLS enabled and direct `anon` / `authenticated` table grants are revoked. Application data is accessed through the server-side Edge Function.
