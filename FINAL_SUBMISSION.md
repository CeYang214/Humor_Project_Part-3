# Final Submission (All Three Projects)

## Commit-Specific Vercel URLs

- Caption creation + rating app  
  Commit: `d1d9d26a8c79224112d2d6d3129330e4af2af0d8`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-hello-world/8zrt6HyZaMa8CFAgarhikJT1b5GK
- Admin area app  
  Commit: `4b7ca458e2776f719a04409f3ee359099b1b81b9`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-part-3/3Q6ksV5zxvrWKmnGYywCEwAr9p1G
- Prompt chain tool app  
  Commit: `fb54787500d25c06e8ce95fd44b4db50f868d45c`  
  URL: https://vercel.com/cecilia-yangs-projects/humor-project-part-2/8V5nWaoQRuEa52EiifF36Ux2g1qG

## Full QA/Test Plan (Tree Coverage)

### Project 1: Caption Creation + Rating App

- Branch 1: Guest lands on `/` and can browse gallery cards.
- Branch 2: Pagination (prev/next/direct jump) works at first/middle/last pages.
- Branch 3: Guest vote attempt is blocked with sign-in prompt.
- Branch 4: Authenticated vote creates a new `caption_votes` row.
- Branch 5: Existing vote updates correctly for same caption/user.
- Branch 6: Empty or partial dataset states render fallback text.
- Branch 7: Invalid/expired token branch clears local session.

### Project 2: Admin Area App

- Branch 1: Unauthenticated `/admin*` redirects to `/`.
- Branch 2: Signed-in non-admin rejected from admin routes.
- Branch 3: Superadmin/matrix-admin access succeeds.
- Branch 4: Dashboard stats/KPI cards load and handle partial query failures.
- Branch 5: Users/captions/ratings read pages render data + empty/error states.
- Branch 6: Images CRUD (create/read/update/delete/upload) completes end-to-end.
- Branch 7: Admin operations tables support paging/search and entity actions.

### Project 3: Prompt Chain Tool App

- Branch 1: `/protected` is gated without auth.
- Branch 2: File validation enforces supported image content types.
- Branch 3: 4-step pipeline path works (presign, upload, register image, generate captions).
- Branch 4: API/storage failures surface readable error messages.
- Branch 5: Generated captions persist and history hydrates by image.
- Branch 6: Humor flavor CRUD works.
- Branch 7: Flavor step CRUD/reorder persists after reload.
- Branch 8: Flavor tester path runs and displays result/error states.

## Post-Testing Write-Up (Issues Found + Fixes)

- Executed full workflow smoke checks 3 times (lint/build/start + key route checks).
- Verified consistent unauthenticated route gating: `/protected` and `/admin*` redirect behavior stable.
- Verified `/auth/callback` redirect path behavior remained stable across repeated runs.
- Found Next.js middleware deprecation issue in Part 2 (`middleware.ts` convention warning).
- Fixed by migrating to `proxy.ts`, updating lint target, and removing `middleware.ts`.
- Found build reliability risk from external Google font fetch dependency in Part 3.
- Fixed by removing `next/font/google` usage and switching to local/system CSS font vars.

## Submission Notes

Submit this file plus the three URLs above in the course submission form.
