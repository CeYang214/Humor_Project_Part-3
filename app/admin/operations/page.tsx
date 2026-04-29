import Link from 'next/link'

import { ADMIN_ENTITY_DEFINITIONS } from '@/lib/admin/entities'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

interface AdminOperationsIndexPageProps {
  searchParams: Promise<{
    status?: string
    message?: string
    entity?: string
  }>
}

export default async function AdminOperationsIndexPage({ searchParams }: AdminOperationsIndexPageProps) {
  await requireSuperadminOrMatrixAdmin()
  const params = await searchParams

  const bannerStatus = params.status === 'success' ? 'success' : params.status === 'error' ? 'error' : null
  const bannerMessage = typeof params.message === 'string' ? params.message : ''
  const highlightedEntity = typeof params.entity === 'string' ? params.entity : ''

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/80">Data Operations</p>
        <h2 className="mt-2 text-2xl font-semibold">Admin Database Control Panel</h2>
        <p className="mt-2 text-sm text-slate-300">
          Each function now has its own page. Choose a table below to open dedicated read/CRUD controls.
        </p>
      </section>

      {bannerStatus && bannerMessage && (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            bannerStatus === 'success'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
              : 'border-rose-400/40 bg-rose-500/10 text-rose-100'
          }`}
        >
          {bannerMessage}
          {highlightedEntity && (
            <span className="ml-2">
              <Link href={`/admin/operations/${encodeURIComponent(highlightedEntity)}`} className="underline">
                Open {highlightedEntity}
              </Link>
            </span>
          )}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ADMIN_ENTITY_DEFINITIONS.map((entity) => (
          <article key={entity.key} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">{entity.label}</p>
            <p className="mt-1 text-xs text-slate-400">{entity.mode.replace('_', ' + ')}</p>
            <p className="mt-2 text-sm text-slate-300">{entity.description}</p>
            <Link
              href={`/admin/operations/${entity.key}`}
              className="admin-ops-jump-link mt-3 inline-flex rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
            >
              Open {entity.label}
            </Link>
          </article>
        ))}
      </section>
    </div>
  )
}
