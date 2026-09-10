# Security

This repository must not contain production credentials or employee data.

- Keep the repository private.
- Never commit `.env` files, database URLs with passwords, Supabase secret/service-role keys, or plaintext user passwords.
- Rotate credentials immediately if they are ever exposed in chat, tickets, screenshots, logs, or source control.
- Prefer strong unique passwords and MFA/SSO for privileged HRMS accounts.
- Add rate limiting / lockout controls before broad production rollout.
