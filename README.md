# Humor Admin Area

Standalone Next.js + Supabase admin app for database operations and analytics.

## Core Routes

- `/admin` (dashboard stats)
- `/admin/humor-flavors` (prompt-chain flavor/step CRUD + step reorder + API tester)
- `/admin/users` (read users/profiles)
- `/admin/images` (create/read/update/delete images + upload)
- `/admin/captions` (read captions)
- `/admin/operations` (expanded table operations)

## Delivered Features

- Google-authenticated admin wall.
- Admin access restricted to `profiles.is_superadmin == TRUE OR profiles.is_matrix_admin == TRUE`.
- Interesting dashboard statistics with exact KPI counts.
- Prompt-chain tool for Assignment 6:
  - create/update/delete humor flavors
  - create/update/delete humor flavor steps
  - reorder humor flavor steps (up/down or target position)
  - read captions for selected flavor (when captions table stores flavor linkage)
  - generate captions on an image test set through `https://api.almostcrackd.ai`
- Required CRUD/read capabilities from the assignment:
  - `profiles`: read
  - `images`: create/read/update/delete + upload
  - `captions`: read
  - `humor_flavors`: create/read/update/delete
  - `humor_flavor_steps`: create/read/update/delete + reorder
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

## Submissions

- Caption creation + rating app  
  Commit: `fb54787500d25c06e8ce95fd44b4db50f868d45c`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-part-2/8V5nWaoQRuEa52EiifF36Ux2g1qG
- Admin area app  
  Commit: `0d7458765550f433d387bbd94ef1d6f8fbcfa290`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-part-3/3rVCNYnRS8NwE269Fgz3h6dk1nx7
- Prompt chain tool app  
  Commit: `d1d9d26a8c79224112d2d6d3129330e4af2af0d8`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-hello-world/8zrt6HyZaMa8CFAgarhikJT1b5GK
