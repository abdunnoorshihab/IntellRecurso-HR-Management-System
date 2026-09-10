# IntellRecurso HR Management System

GitHub-ready source for the IR HRMS.

## Stack

- Frontend: static HTML/CSS/JavaScript
- Hosting: Vercel
- Backend: Supabase Edge Function (`hrms-api`)
- Database: Supabase PostgreSQL
- Authentication: application session cookie + scrypt password hashes

## Included modules

Dashboard, Employees, Organization, Attendance, Leave & Approvals, Daily Tasks, KPI & Performance, Requisitions, Conveyance, Salary, Employee Funds, HR Letters, CEO Reports, User Administration, Settings and Audit Logs.

## Repository structure

```text
.
├── index.html
├── login.html
├── employees.html
├── attendance.html
├── ...
├── assets/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 001_hrms_schema.sql
│   └── functions/
│       └── hrms-api/
│           ├── index.ts
│           ├── app.js
│           ├── db.js
│           └── mini-express.js
├── scripts/
├── docs/
└── vercel.json
```

## Important: keep this repository private

This is an HR management system. The code package intentionally does **not** include live employee records, database passwords, temporary admin passwords, `.env` secrets or Supabase secret keys.

## Push to GitHub

Create a new **Private** repository on GitHub, then from this project folder run:

```bash
git init
git add .
git commit -m "Initial IR HRMS source"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

## Existing Supabase project

The current `vercel.json` points `/api/*` to the existing Supabase project and `hrms-api` Edge Function. The database schema is already present in that project.

For future Edge Function updates using Supabase CLI:

```bash
supabase login
supabase link --project-ref lywrxzccsichocxjjhvq
supabase functions deploy hrms-api --no-verify-jwt
```

`verify_jwt` is disabled at the platform gateway because this application implements its own HttpOnly session-cookie authentication in the function. Do not remove the application auth middleware.

## New Supabase project / fresh database

If you clone this system into a different Supabase project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy hrms-api --no-verify-jwt
```

Then update the Supabase project URL in `vercel.json`.

`supabase/seed.example.sql` contains only non-sensitive bootstrap examples. Never commit production employee data or plaintext passwords.

## Deploy frontend to Vercel

1. Import the private GitHub repository into Vercel.
2. Framework preset: **Other** / static site.
3. No database environment variable is required on Vercel with this architecture.
4. Deploy.

The browser calls `/api/*`; `vercel.json` proxies those requests to the Supabase Edge Function while keeping the browser API calls same-origin.

## Local checks

```bash
npm run check
```

For local frontend preview, use any static web server. API requests need either Vercel's rewrite behavior or a local proxy to the Edge Function.

## First admin on a brand-new database

Generate a compatible password hash without committing the password:

```bash
HRMS_ADMIN_PASSWORD='your-strong-password' npm run hash-password
```

Use the resulting hash when inserting the first row into `users` through a trusted SQL/admin workflow. Do not put plaintext passwords in Git.

## Security notes

- Keep the GitHub repository private.
- Rotate any database password that has ever been pasted into chat or another unsecured location.
- Do not put Supabase service/secret keys in frontend code.
- Use HTTPS only in production.
- Change temporary admin passwords immediately.
- Before broad rollout, add login rate limiting and ideally MFA/SSO for privileged accounts.
# IntellRecurso-HR-Management-System
