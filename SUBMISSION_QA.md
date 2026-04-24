# Final Submission: End-to-End Testing + QA Plan

## Vercel App URLs (Commit-Specific)

- Caption creation + rating app  
  Commit: `fb54787500d25c06e8ce95fd44b4db50f868d45c`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-part-2/8V5nWaoQRuEa52EiifF36Ux2g1qG
- Admin area app  
  Commit: `0d7458765550f433d387bbd94ef1d6f8fbcfa290`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-part-3/3rVCNYnRS8NwE269Fgz3h6dk1nx7
- Prompt chain tool app  
  Commit: `d1d9d26a8c79224112d2d6d3129330e4af2af0d8`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-hello-world/8zrt6HyZaMa8CFAgarhikJT1b5GK

## Full QA Plan (Tree-Style)

### Project 1: Caption Creation + Rating App (`/`)

- Branch 1: Guest user opens home page
- Branch 2: Guest sees caption gallery cards with images
- Branch 3: Guest attempts vote and gets gated prompt
- Branch 4: Authenticated user session loads successfully
- Branch 5: Authenticated user upvotes/downvotes caption
- Branch 6: Existing vote is updated (same caption)
- Branch 7: Pagination previous/next and direct page jump
- Branch 8: Empty results fallback message
- Branch 9: Missing image URL filtering works (no broken image cards)
- Branch 10: Invalid/expired auth token auto-clears local session

### Project 2: Admin Area App (`/admin` + children)

- Branch 1: Unauthenticated user is blocked and redirected
- Branch 2: Authenticated non-admin user is blocked from admin routes
- Branch 3: Superadmin can access dashboard (`/admin`)
- Branch 4: Matrix admin can access admin routes
- Branch 5: Users read path works (`/admin/users`)
- Branch 6: Images CRUD path works (`/admin/images`)
- Branch 7: Captions read path works (`/admin/captions`)
- Branch 8: Ratings view works (`/admin/ratings`)
- Branch 9: Operations page tables/actions render (`/admin/operations`)
- Branch 10: Theme mode toggles system/light/dark
- Branch 11: Sign-out action returns user to non-admin flow
- Branch 12: Back-to-caption-tool link works

### Project 3: Prompt Chain Tool App (`/protected` + prompt-chain admin)

- Branch 1: Unauthenticated user is redirected from protected route
- Branch 2: Authenticated user opens protected prompt flow
- Branch 3: Invalid file type is rejected with error state
- Branch 4: Valid image upload obtains presigned URL
- Branch 5: Image upload to storage succeeds
- Branch 6: Pipeline caption generation succeeds and shows results
- Branch 7: Generated captions persist to DB and reload in history
- Branch 8: History selection hydrates image + caption list
- Branch 9: Auth callback route redirects correctly to `/protected`
- Branch 10: Prompt chain admin page CRUD for humor flavors
- Branch 11: Prompt step CRUD and reorder behavior
- Branch 12: Prompt chain tester call to API path returns expected response handling

## Executed End-to-End Test Runs

Executed 3 full workflow passes locally against production build + runtime routes using:

- `npm run lint`
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build`
- `npm run start -- -p 3010`
- Route matrix checks for `/`, `/protected`, `/admin`, `/admin/users`, `/admin/images`, `/admin/captions`, `/admin/humor-flavors`, `/admin/operations`, `/admin/ratings`, `/auth/callback`, `/auth/callback?code=fake-code`

Result across all 3 passes:

- `/` returned `200` and rendered `Caption Gallery`
- Protected/admin routes consistently returned `307` redirect for unauthenticated access
- Auth callback routes consistently returned `307` redirect to `/protected`
- No route-level regressions observed across 3 repeated runs

## Post-Testing Write-Up (Issues Found + Fixes)

- Ran full lint/build/start plus route-flow checks three complete times and confirmed consistent behavior run-to-run.
- Verified guest gating behavior for protected and admin paths; all protected/admin branches correctly redirected (`307`) to safe paths.
- Verified auth callback behavior in both no-code and mock-code states; both correctly redirected to `/protected`.
- Found a build reliability issue: `next/font/google` required external fetches (Google Fonts), which breaks in restricted/offline execution contexts.
- Fixed that reliability issue by removing `next/font/google` imports in `app/layout.tsx` and switching to local/system font variables defined in `app/globals.css`.
- Updated metadata in `app/layout.tsx` from default scaffold values to application-specific title/description.
- Re-ran lint/build/workflow matrix after the fix and confirmed the app compiles and all tested flows remain stable.

## Files Changed During Testing Hardening

- `app/layout.tsx`
- `app/globals.css`
