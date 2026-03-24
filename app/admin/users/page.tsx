import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

import { UsersTable } from '@/app/admin/users/users-table'

type ProfileRecord = Record<string, unknown>

export default async function AdminUsersPage() {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const { data, error } = await supabase.from('profiles').select('*').limit(500)

  const profiles = (data ?? []) as ProfileRecord[]

  return (
    <div className="space-y-5">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Users / Profiles</p>
        <h2 className="mt-2 text-2xl font-semibold">Read-Only Profile Directory</h2>
        <p className="mt-2 text-sm text-slate-300">Browse profiles, inspect superadmin assignments, and audit raw metadata.</p>
        {error && (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Failed to load profiles: {error.message}
          </div>
        )}
      </section>

      <UsersTable profiles={profiles} />
    </div>
  )
}
