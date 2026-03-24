# Humor Prompt Chain Tool

Standalone Next.js + Supabase project for managing humor flavors and flavor steps.

## Core Route

- `/admin/prompt-chain`

## Delivered Features

- Auth gate: only users with `profiles.is_superadmin == TRUE` or `profiles.is_matrix_admin == TRUE`.
- Create, update, delete humor flavors.
- Create, update, delete humor flavor steps.
- Reorder humor flavor steps (move up/down by swapping step order values).
- Read captions produced by the selected flavor (best-effort flavor reference detection).
- Test a flavor against image test-set rows by calling `https://api.almostcrackd.ai`.
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

1. Push this folder as a **new GitHub repository** for the prompt-chain tool.
2. Create a **new Vercel project** from that repo.
3. In Vercel, set **Deployment Protection** to **Off**.
4. Submit commit-specific Vercel URLs for all three apps:
   - caption creation + rating app
   - admin area app
   - prompt chain tool app
