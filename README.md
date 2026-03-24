# Humor Admin Area

Standalone Next.js + Supabase admin app for database operations and analytics.

## Core Routes

- `/admin` (dashboard stats)
- `/admin/users` (read users/profiles)
- `/admin/images` (create/read/update/delete images + upload)
- `/admin/captions` (read captions)
- `/admin/operations` (expanded table operations)

## Delivered Features

- Google-authenticated admin wall.
- Admin access restricted to `profiles.is_superadmin == TRUE`.
- Interesting dashboard statistics with exact KPI counts.
- Required CRUD/read capabilities from the assignment:
  - `profiles`: read
  - `images`: create/read/update/delete + upload
  - `captions`: read
  - `humor_flavors`: read
  - `humor_flavor_steps`: read
  - `humor_mix`: read/update
  - `terms`: create/read/update/delete
  - `caption_requests`: read
  - `caption_examples`: create/read/update/delete
  - `llm_models`: create/read/update/delete
  - `llm_providers`: create/read/update/delete
  - `llm_prompt_chains`: read
  - `llm_responses`: read
  - `allowed_signup_domains`: create/read/update/delete
  - `whitelisted_email_addresses`: create/read/update/delete
- Theme mode toggle: `system`, `light`, `dark`.

## Environment Variables

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Local Run

```bash
npm install
npm run dev
```

## Submission Checklist

1. Push this folder as a **new GitHub repository** for the admin app.
2. Create a **new Vercel project** from that repo.
3. In Vercel, set **Deployment Protection** to **Off**.
4. Submit commit-specific Vercel URLs for:
   - caption creation + rating app
   - admin area app
