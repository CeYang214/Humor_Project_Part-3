import {
  createEntityAction,
  deleteEntityAction,
  updateEntityAction,
  uploadImageAction,
} from '@/app/admin/actions'
import {
  ADMIN_ENTITY_DEFINITIONS,
  entitySupportsCreate,
  entitySupportsDelete,
  entitySupportsUpdate,
} from '@/lib/admin/entities'
import { loadEntitySnapshot, pickRowIdentifier, stringifyJson } from '@/lib/admin/table-access'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

interface AdminOperationsPageProps {
  searchParams: Promise<{
    status?: string
    message?: string
    entity?: string
  }>
}

const EMPTY_CREATE_PAYLOAD = JSON.stringify({
  label: 'Replace with real columns for this table',
}, null, 2)
const MAX_VISIBLE_ROWS_PER_ENTITY = 20

function stringifyIdentifier(value: unknown) {
  return JSON.stringify(value)
}

export default async function AdminOperationsPage({ searchParams }: AdminOperationsPageProps) {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const params = await searchParams

  const snapshots = await Promise.all(
    ADMIN_ENTITY_DEFINITIONS.map((entity) => loadEntitySnapshot(supabase, entity))
  )

  const bannerStatus = params.status === 'success' ? 'success' : params.status === 'error' ? 'error' : null
  const bannerMessage = typeof params.message === 'string' ? params.message : ''

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/80">Data Operations</p>
        <h2 className="mt-2 text-2xl font-semibold">Admin Database Control Panel</h2>
        <p className="mt-2 text-sm text-slate-300">
          This page covers read and CRUD operations across users, images, flavors, LLM config tables, and moderation lists.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {snapshots.map((snapshot) => (
            <a
              key={`jump-${snapshot.entity.key}`}
              href={`#entity-${snapshot.entity.key}`}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
            >
              {snapshot.entity.label}
            </a>
          ))}
        </div>
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
        </section>
      )}

      {snapshots.map((snapshot) => {
        const { entity, rows, tableName, errorMessage } = snapshot
        const canCreate = entitySupportsCreate(entity)
        const canUpdate = entitySupportsUpdate(entity)
        const canDelete = entitySupportsDelete(entity)
        const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS_PER_ENTITY)
        const hiddenRowCount = Math.max(0, rows.length - visibleRows.length)

        return (
          <section
            key={entity.key}
            id={`entity-${entity.key}`}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">{entity.label}</p>
                <h3 className="mt-1 text-xl font-semibold">{tableName ?? entity.tableCandidates[0]}</h3>
                <p className="mt-1 text-sm text-slate-300">{entity.description}</p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                {entity.mode.replace('_', ' + ')}
              </span>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {errorMessage}
              </div>
            )}

            {entity.key === 'images' && (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <h4 className="text-sm font-semibold">Upload New Image File</h4>
                <p className="mt-1 text-xs text-slate-400">
                  Uploads to Supabase Storage, then inserts a new row into `images` with the uploaded public URL.
                </p>
                <form action={uploadImageAction} className="mt-3 grid gap-3 md:grid-cols-4">
                  <label className="grid gap-1 text-xs text-slate-300 md:col-span-2">
                    Image file
                    <input
                      type="file"
                      name="file"
                      accept="image/*"
                      required
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-300">
                    Storage bucket
                    <input
                      name="bucket"
                      defaultValue="images"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-300">
                    Prefix (optional)
                    <input
                      name="prefix"
                      placeholder="admin-uploads"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
                    />
                  </label>
                  <div className="md:col-span-4">
                    <button
                      type="submit"
                      className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600"
                    >
                      Upload Image
                    </button>
                  </div>
                </form>
              </div>
            )}

            {canCreate && (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <h4 className="text-sm font-semibold">Create Row</h4>
                <form action={createEntityAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="entity_key" value={entity.key} />
                  <label className="grid gap-1 text-xs text-slate-300">
                    JSON payload
                    <textarea
                      name="payload"
                      rows={6}
                      defaultValue={EMPTY_CREATE_PAYLOAD}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                    />
                  </label>
                  <button
                    type="submit"
                    className="w-fit rounded-xl border border-cyan-400/70 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                  >
                    Create {entity.label}
                  </button>
                </form>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {rows.length === 0 && !errorMessage && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
                  No rows returned.
                </div>
              )}

              {hiddenRowCount > 0 && (
                <div className="admin-ops-info rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">
                  Showing first {visibleRows.length} rows for layout/performance. {hiddenRowCount} additional row(s) are hidden.
                </div>
              )}

              <div className="grid gap-3 xl:grid-cols-2">
                {visibleRows.map((row, index) => {
                const identifier = pickRowIdentifier(row)
                const rowJson = stringifyJson(row)

                return (
                  <article
                    key={`${entity.key}-row-${index}`}
                    className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        Row {index + 1}
                        {identifier ? ` | ${identifier.column}: ${String(identifier.value)}` : ''}
                      </p>
                    </div>

                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
                      {rowJson}
                    </pre>

                    {canUpdate && identifier && (
                      <form action={updateEntityAction} className="mt-3 grid gap-2">
                        <input type="hidden" name="entity_key" value={entity.key} />
                        <input type="hidden" name="match_column" value={identifier.column} />
                        <input type="hidden" name="match_value" value={stringifyIdentifier(identifier.value)} />
                        <label className="grid gap-1 text-xs text-slate-300">
                          Update payload (JSON)
                          <textarea
                            name="payload"
                            rows={6}
                            defaultValue={rowJson}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                          />
                        </label>
                        <button
                          type="submit"
                          className="w-fit rounded-xl border border-cyan-500/70 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                        >
                          Update Row
                        </button>
                      </form>
                    )}

                    {canDelete && identifier && (
                      <form action={deleteEntityAction} className="mt-2">
                        <input type="hidden" name="entity_key" value={entity.key} />
                        <input type="hidden" name="match_column" value={identifier.column} />
                        <input type="hidden" name="match_value" value={stringifyIdentifier(identifier.value)} />
                        <button
                          type="submit"
                          className="rounded-xl border border-rose-500/60 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
                        >
                          Delete Row
                        </button>
                      </form>
                    )}
                  </article>
                )
                })}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
