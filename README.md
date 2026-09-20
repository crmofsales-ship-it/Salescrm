# Sales CRM

A multi-organization CRM for sales teams. Each company that signs up gets its own private
organization with its own users, data and settings. Built to run as SaaS or white-label.

## Features

**Sales workflow**
- Dashboard with revenue, pipeline value, open deals, win rate and a "needs attention" list
- Leads: scoring, duplicate detection, CSV/Excel import, inactivity warnings and auto-reassignment
- Deals: staged pipeline with change history and revert
- Meetings (Google Meet, Teams, in person) with calendar invites, RSVP links and reminders
- Tasks and activities, team targets (monthly / quarterly / yearly)
- Daily Sales Report (DSR) PDFs generated and emailed on a schedule
- Team chat, analytics and reports
- AI assistant that answers questions about the CRM and, with approval, creates tasks, schedules follow-ups and drafts emails

**Platform**
- Organization signup, onboarding, logo branding, invitations, organization switcher
- Roles: `owner`, `admin`, `sales_manager`, `sales_rep`
- Tenant isolation enforced in PostgreSQL with row-level security
- Sign-in logs (device, location), automatic idle sign-out
- Light and dark themes

## Architecture

```
frontend/   React 19 + Vite SPA
backend/    Node.js + Express API
supabase/   PostgreSQL schema, migrations, storage policies, optional demo seed
```

- **Database / auth / storage:** [Supabase](https://supabase.com) (PostgreSQL, Supabase Auth, Storage)
- **Tenant isolation:** every tenant table carries `organization_id`; row-level security policies
  restrict reads and writes to members of that organization
- **API access pattern:** the API verifies the caller's Supabase JWT, resolves the active organization
  (`X-Organization-Id` header, membership-checked) and queries the database *as the calling user*, so
  the same RLS rules apply whether the browser or the API makes the request. The service-role key is
  used only for system jobs (token refresh, cron digests, user provisioning)
- **Hosting:** frontend and API deploy as two separate Vercel projects; the API can also run on Render

## Quick start

**Prerequisites:** Node 18+, a Supabase project.

1. **Create the database.** In the Supabase SQL Editor, run `supabase/fresh_install.sql` once.
   A fresh database starts with no organizations; the first person to sign up creates the first.
2. **Enable auth.** In Supabase → Authentication → Providers, enable Email. Set the Site URL and
   redirect URLs to your frontend origin.
3. **Configure environment files**

   ```bash
   cp frontend/.env.example frontend/.env
   cp backend/.env.example  backend/.env
   ```

   Fill in the Supabase URL and keys (see the comments in each `.env.example`).
4. **Run**

   ```bash
   cd backend  && npm install && npm start      # API, default port 5000
   cd frontend && npm install && npm run dev    # app, http://localhost:5173
   ```

   On macOS, port 5000 is used by AirPlay Receiver. Set `PORT=5001` in `backend/.env` and
   `VITE_API_URL=http://localhost:5001` in `frontend/.env`.
5. Open the app, sign up, and create your organization.

Optional: `node supabase/seed_demo.mjs` creates two sample organizations with invented data.

### Storage

`fresh_install.sql` creates the storage buckets and policies. If your SQL Editor role is refused
access to the `storage` schema it prints a warning; run `supabase/storage_policies.sql` or create
the buckets (`crm-files`, `chat-files`, `ai-documents` private; `org-logos` public) in the dashboard.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | frontend | Supabase project URL and publishable key |
| `VITE_API_URL` | frontend | API base URL |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | backend | Supabase project URL and publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | backend only | Server-side key. Never expose to the browser |
| `SUPABASE_JWT_SECRET` | backend (optional) | Only for projects still on the legacy HS256 secret; otherwise tokens are verified via the project's JWKS |
| `FRONTEND_URL`, `ALLOWED_ORIGINS` | backend | CORS and redirect targets |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | backend | Gmail / Google Calendar integration |
| `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS`, `RESEND_API_KEY` | backend | Outbound email (invites, reports, reminders) |
| `GROQ_API_KEY` | backend | AI assistant |
| `CRON_SECRET`, `REMINDER_SECRET` | backend | Authenticates scheduled-job endpoints |

## Deployment (Vercel)

Deploy `backend/` and `frontend/` as two projects. Set the variables above on each (the frontend
only needs the `VITE_*` ones). Then add your frontend URL to Supabase → Authentication → URL
Configuration. Scheduled digests run from `.github/workflows/dsr-scheduler.yml`; add repository
secrets `BACKEND_URL` and `CRON_SECRET`.

## Security notes

- Never commit `.env` files or the service-role key.
- Rotate any key that has appeared in a repository or chat.
- Before onboarding real customers, verify tenant isolation with two test organizations
  (each must see none of the other's leads, deals, files or settings).

## Known limitations

- No billing or subscription management
- No automated tests
- Gmail sync requires a Google OAuth client; public use of the Gmail scopes requires Google's
  verification process
- Email sending needs a mail provider; the AI assistant needs a provider key
- Some screens (login, onboarding, dashboard, organization admin) use the newer design; others
  retain earlier layouts

## License

Proprietary. See `LICENSE`.
