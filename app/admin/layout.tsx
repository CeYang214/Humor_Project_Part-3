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

  return (
    <div className="admin-theme min-h-screen bg-[radial-gradient(circle_at_top_left,#082f49_0%,#020617_45%,#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:gap-8 lg:px-8">
        <aside className="h-fit rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-5 shadow-2xl backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Admin Area</p>
          <h1 className="mt-2 text-2xl font-semibold">Humor Ops Console</h1>
          <p className="mt-2 text-xs text-slate-400">Signed in as {user.email ?? user.id}</p>

          <AdminNav />
          <ThemeModeToggle />

          <div className="mt-6 grid gap-2">
            <Link
              href="/protected"
              className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Back to Caption Tool
            </Link>
            <form action={signOutAdminAction}>
              <button
                type="submit"
                className="w-full rounded-xl border border-rose-500/50 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
              >
                Sign Out
              </button>
            </form>
          </div>
        </aside>

        <main className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl backdrop-blur lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
