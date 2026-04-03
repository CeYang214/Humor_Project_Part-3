import Link from 'next/link'

import { signOutAdminAction } from '@/app/admin/actions'
import { AdminNav } from '@/app/admin/admin-nav'
import { ThemeModeToggle } from '@/app/admin/theme-mode-toggle'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { user } = await requireSuperadminOrMatrixAdmin()
  const userLabel = user.email ?? user.id

  return (
    <div className="admin-theme min-h-screen bg-[radial-gradient(circle_at_top_left,#082f49_0%,#020617_45%,#020617_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-4 lg:px-6">
        <div className="grid gap-4 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-5">
          <aside className="rounded-2xl border border-cyan-400/20 bg-slate-950/75 p-4 shadow-2xl backdrop-blur lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/80">Admin</p>
            <h1 className="mt-1 text-lg font-semibold">Humor Ops</h1>
            <p className="mt-2 truncate text-xs text-slate-400" title={userLabel}>
              Signed in as {userLabel}
            </p>

            <AdminNav />
            <ThemeModeToggle />

            <div className="mt-4 grid gap-2">
              <Link
                href="/protected"
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Back to Caption Tool
              </Link>
              <form action={signOutAdminAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg border border-rose-500/50 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </aside>

          <main className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl backdrop-blur sm:p-5 lg:p-6">
          {children}
          </main>
        </div>
      </div>
    </div>
  )
}
