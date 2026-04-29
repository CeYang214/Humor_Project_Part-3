import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  createEntityAction,
  deleteEntityAction,
  updateEntityAction,
  uploadImageAction,
} from '@/app/admin/actions'
import {
  entitySupportsCreate,
  entitySupportsDelete,
  entitySupportsUpdate,
  getEntityDefinition,
} from '@/lib/admin/entities'
import { loadEntitySnapshot, pickRowIdentifier, stringifyJson, stringifyPayloadObject } from '@/lib/admin/table-access'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

interface AdminOperationEntityPageProps {
  params: Promise<{
    entity: string
  }>
  searchParams: Promise<{
    status?: string
    message?: string
    page?: string
    q?: string
  }>
}

const EMPTY_CREATE_PAYLOAD = stringifyPayloadObject({
  label: 'Replace with real columns for this table',
})
const PAGE_SIZE = 20

function stringifyIdentifier(value: unknown) {
  return JSON.stringify(value)
}

function parsePositiveInt(value: string | undefined, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

function buildEntityHref(entityKey: string, page: number, query: string) {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  if (query) params.set('q', query)
  const queryString = params.toString()
  return queryString ? `/admin/operations/${entityKey}?${queryString}` : `/admin/operations/${entityKey}`
}

export default async function AdminOperationEntityPage({ params, searchParams }: AdminOperationEntityPageProps) {
  const { entity: entityKey } = await params
  const paramsData = await searchParams
  const entity = getEntityDefinition(entityKey)
  if (!entity) notFound()

  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const snapshot = await loadEntitySnapshot(supabase, entity)
  const { rows, tableName, errorMessage } = snapshot
  const canCreate = entitySupportsCreate(entity)
  const canUpdate = entitySupportsUpdate(entity)
  const canDelete = entitySupportsDelete(entity)

  const searchQuery = typeof paramsData.q === 'string' ? paramsData.q.trim() : ''
  const loweredQuery = searchQuery.toLowerCase()
  const filteredRows = loweredQuery
    ? rows.filter((row) => stringifyJson(row).toLowerCase().includes(loweredQuery))
    : rows

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const requestedPage = parsePositiveInt(paramsData.page)
  const currentPage = Math.min(requestedPage, totalPages)
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE
  const visibleRows = filteredRows.slice(pageStartIndex, pageStartIndex + PAGE_SIZE)
  const pageStartLabel = totalRows === 0 ? 0 : pageStartIndex + 1
  const pageEndLabel = Math.min(pageStartIndex + visibleRows.length, totalRows)

  const hasPreviousPage = currentPage > 1
  const hasNextPage = currentPage < totalPages
  const firstPageHref = buildEntityHref(entity.key, 1, searchQuery)
  const previousPageHref = buildEntityHref(entity.key, currentPage - 1, searchQuery)
  const nextPageHref = buildEntityHref(entity.key, currentPage + 1, searchQuery)
  const lastPageHref = buildEntityHref(entity.key, totalPages, searchQuery)
  const returnTo = buildEntityHref(entity.key, currentPage, searchQuery)

  const bannerStatus = paramsData.status === 'success' ? 'success' : paramsData.status === 'error' ? 'error' : null
  const bannerMessage = typeof paramsData.message === 'string' ? paramsData.message : ''

  return (
    <div className="admin-operations-page space-y-6">
      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/80">Data Operations</p>
        <h2 className="mt-2 text-2xl font-semibold">{entity.label}</h2>
        <p className="mt-2 text-sm text-slate-300">{entity.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/operations"
            className="admin-ops-jump-link rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
          >
            Back to all operations
          </Link>
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

      <section id={`entity-${entity.key}`} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
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
          <div className="admin-warning-banner mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
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
              <input type="hidden" name="redirect_to" value={returnTo} />
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
                  className="admin-ops-upload-btn rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600"
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
              <input type="hidden" name="redirect_to" value={returnTo} />
              <label className="grid gap-1 text-xs text-slate-300">
                Payload (`column: value` per line; JSON object also supported)
                <textarea
                  name="payload"
                  rows={6}
                  defaultValue={EMPTY_CREATE_PAYLOAD}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                />
              </label>
              <button
                type="submit"
                className="admin-ops-create-btn w-fit rounded-xl border border-cyan-400/70 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Create {entity.label}
              </button>
            </form>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form method="get" className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs text-slate-300">
                  Search content
                  <input
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="Search row JSON..."
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <button
                  type="submit"
                  className="admin-ops-jump-link rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                >
                  Search
                </button>
                {searchQuery && (
                  <Link
                    href={buildEntityHref(entity.key, 1, '')}
                    className="admin-ops-jump-link rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                  >
                    Clear
                  </Link>
                )}
              </form>

              <form method="get" className="flex flex-wrap items-end gap-2">
                {searchQuery && <input type="hidden" name="q" value={searchQuery} />}
                <label className="grid gap-1 text-xs text-slate-300">
                  Go to page
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    name="page"
                    defaultValue={currentPage}
                    className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <button
                  type="submit"
                  className="admin-ops-jump-link rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                >
                  Go
                </button>
              </form>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span>
                Showing {pageStartLabel}-{pageEndLabel} of {totalRows} row(s)
                {searchQuery ? ` (filtered from ${rows.length})` : ''}
              </span>
              <span>|</span>
              <span>
                Page {currentPage} of {totalPages}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {hasPreviousPage ? (
                <>
                  <Link
                    href={firstPageHref}
                    className="admin-ops-jump-link rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                  >
                    First
                  </Link>
                  <Link
                    href={previousPageHref}
                    className="admin-ops-jump-link rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                  >
                    Previous
                  </Link>
                </>
              ) : (
                <>
                  <span className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-500">First</span>
                  <span className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-500">Previous</span>
                </>
              )}

              {hasNextPage ? (
                <>
                  <Link
                    href={nextPageHref}
                    className="admin-ops-jump-link rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                  >
                    Next
                  </Link>
                  <Link
                    href={lastPageHref}
                    className="admin-ops-jump-link rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                  >
                    Last
                  </Link>
                </>
              ) : (
                <>
                  <span className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-500">Next</span>
                  <span className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-500">Last</span>
                </>
              )}
            </div>
          </div>

          {filteredRows.length === 0 && !errorMessage && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
              {searchQuery ? 'No rows match the search query.' : 'No rows returned.'}
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
            {visibleRows.map((row, index) => {
              const identifier = pickRowIdentifier(row)
              const rowJson = stringifyJson(row)
              const rowNumber = pageStartIndex + index + 1

              return (
                <article key={`${entity.key}-row-${rowNumber}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">
                      Row {rowNumber}
                      {identifier ? ` | ${identifier.column}: ${String(identifier.value)}` : ''}
                    </p>
                  </div>

                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
                    {rowJson}
                  </pre>

                  {canUpdate && identifier && (
                    <form action={updateEntityAction} className="mt-3 grid gap-2">
                      <input type="hidden" name="entity_key" value={entity.key} />
                      <input type="hidden" name="redirect_to" value={returnTo} />
                      <input type="hidden" name="match_column" value={identifier.column} />
                      <input type="hidden" name="match_value" value={stringifyIdentifier(identifier.value)} />
                      <label className="grid gap-1 text-xs text-slate-300">
                        Update payload (`column: value` per line; JSON object also supported)
                        <textarea
                          name="payload"
                          rows={6}
                          defaultValue={stringifyPayloadObject(row)}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                        />
                      </label>
                      <button
                        type="submit"
                        className="admin-ops-update-btn w-fit rounded-xl border border-cyan-500/70 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                      >
                        Update Row
                      </button>
                    </form>
                  )}

                  {canDelete && identifier && (
                    <form action={deleteEntityAction} className="mt-2">
                      <input type="hidden" name="entity_key" value={entity.key} />
                      <input type="hidden" name="redirect_to" value={returnTo} />
                      <input type="hidden" name="match_column" value={identifier.column} />
                      <input type="hidden" name="match_value" value={stringifyIdentifier(identifier.value)} />
                      <button
                        type="submit"
                        className="admin-ops-delete-btn rounded-xl border border-rose-500/60 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
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
    </div>
  )
}
