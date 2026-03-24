import Link from 'next/link'

import {
  createEntityAction,
  deleteEntityAction,
  reorderHumorFlavorStepAction,
  updateEntityAction,
} from '@/app/admin/actions'
import { getEntityDefinition } from '@/lib/admin/entities'
import { loadEntitySnapshot, pickRowIdentifier, stringifyJson } from '@/lib/admin/table-access'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

import { PromptChainTester } from './prompt-chain-tester'

type UnknownRow = Record<string, unknown>

interface PromptChainPageProps {
  searchParams: Promise<{
    status?: string
    message?: string
    entity?: string
    flavor?: string
  }>
}

const ORDER_COLUMN_CANDIDATES = [
  'step_order',
  'step_index',
  'order_index',
  'sort_order',
  'sequence',
  'position',
  'step_number',
]

const FLAVOR_REF_COLUMN_CANDIDATES = [
  'humor_flavor_id',
  'flavor_id',
  'humor_flavor_uuid',
  'prompt_chain_id',
]

const FLAVOR_LABEL_COLUMN_CANDIDATES = ['name', 'title', 'label', 'slug']

function asString(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function detectColumn(rows: UnknownRow[], candidates: string[]) {
  for (const candidate of candidates) {
    if (rows.some((row) => candidate in row)) {
      return candidate
    }
  }
  return null
}

function stringifyIdentifier(value: unknown) {
  return JSON.stringify(value)
}

export default async function PromptChainPage({ searchParams }: PromptChainPageProps) {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const params = await searchParams

  const flavorEntity = getEntityDefinition('humor_flavors')
  const stepEntity = getEntityDefinition('humor_flavor_steps')
  const imageEntity = getEntityDefinition('images')
  const captionEntity = getEntityDefinition('captions')

  if (!flavorEntity || !stepEntity || !imageEntity || !captionEntity) {
    return (
      <div className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        Missing required entity definitions (`humor_flavors`, `humor_flavor_steps`, `images`, `captions`).
      </div>
    )
  }

  const [flavorsSnapshot, stepsSnapshot, imagesSnapshot, captionsSnapshot] = await Promise.all([
    loadEntitySnapshot(supabase, flavorEntity),
    loadEntitySnapshot(supabase, stepEntity),
    loadEntitySnapshot(supabase, imageEntity),
    loadEntitySnapshot(supabase, captionEntity),
  ])

  const flavorRows = flavorsSnapshot.rows as UnknownRow[]
  const stepRows = stepsSnapshot.rows as UnknownRow[]
  const imageRows = imagesSnapshot.rows as UnknownRow[]
  const captionRows = captionsSnapshot.rows as UnknownRow[]

  const flavorOptions = flavorRows
    .map((row) => {
      const identifier = pickRowIdentifier(row)
      if (!identifier) return null

      const id = asString(identifier.value)
      if (!id) return null

      const labelColumn = FLAVOR_LABEL_COLUMN_CANDIDATES.find((column) => typeof row[column] === 'string')
      const label = labelColumn ? asString(row[labelColumn]) : id

      return { id, label }
    })
    .filter((item): item is { id: string; label: string } => Boolean(item))

  const selectedFlavorId =
    (typeof params.flavor === 'string' && flavorOptions.some((item) => item.id === params.flavor) ? params.flavor : '') ||
    flavorOptions[0]?.id ||
    ''

  const stepOrderColumn = detectColumn(stepRows, ORDER_COLUMN_CANDIDATES)
  const stepFlavorRefColumn = detectColumn(stepRows, FLAVOR_REF_COLUMN_CANDIDATES)

  const stepRowsForFlavor =
    selectedFlavorId && stepFlavorRefColumn
      ? stepRows.filter((row) => asString(row[stepFlavorRefColumn]) === selectedFlavorId)
      : stepRows

  const orderedSteps = stepRowsForFlavor
    .map((row) => ({
      row,
      identifier: pickRowIdentifier(row),
      orderValue: stepOrderColumn ? toNumber(row[stepOrderColumn]) : null,
    }))
    .sort((a, b) => {
      if (a.orderValue === null && b.orderValue === null) return 0
      if (a.orderValue === null) return 1
      if (b.orderValue === null) return -1
      return a.orderValue - b.orderValue
    })

  const maxOrder = orderedSteps.reduce((acc, step) => {
    if (step.orderValue === null) return acc
    return Math.max(acc, step.orderValue)
  }, 0)

  const defaultStepPayload = stringifyJson(
    stepFlavorRefColumn && stepOrderColumn && selectedFlavorId
      ? {
          [stepFlavorRefColumn]: selectedFlavorId,
          [stepOrderColumn]: maxOrder + 1,
          name: 'New step',
          prompt: 'Describe what this step should do.',
        }
      : {
          // Replace these keys with real columns if your schema differs.
          flavor_id: selectedFlavorId || 'put-flavor-id-here',
          step_order: 1,
          name: 'New step',
          prompt: 'Describe what this step should do.',
        }
  )

  const captionFlavorRefColumn = detectColumn(captionRows, FLAVOR_REF_COLUMN_CANDIDATES)
  const captionRowsForFlavor =
    selectedFlavorId && captionFlavorRefColumn
      ? captionRows.filter((row) => asString(row[captionFlavorRefColumn]) === selectedFlavorId)
      : captionRows

  const imageOptions = imageRows
    .map((row) => ({
      id: asString(row.id),
      url: asString(row.url),
    }))
    .filter((row) => row.id && row.url)

  const bannerStatus = params.status === 'success' ? 'success' : params.status === 'error' ? 'error' : null
  const bannerMessage = typeof params.message === 'string' ? params.message : ''

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/80">Prompt Chain Tool</p>
        <h2 className="mt-2 text-2xl font-semibold">Humor Flavor + Step Manager</h2>
        <p className="mt-2 text-sm text-slate-300">
          Create and reorder humor flavor steps, then test caption generation against your image test set.
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
        </section>
      )}

      {(flavorsSnapshot.errorMessage || stepsSnapshot.errorMessage || imagesSnapshot.errorMessage) && (
        <section className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Some tables could not be read:</p>
          <p className="mt-1">Flavors: {flavorsSnapshot.errorMessage ?? 'ok'}</p>
          <p>Steps: {stepsSnapshot.errorMessage ?? 'ok'}</p>
          <p>Images: {imagesSnapshot.errorMessage ?? 'ok'}</p>
          <p>Captions: {captionsSnapshot.errorMessage ?? 'ok'}</p>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Humor Flavors</p>
              <h3 className="mt-1 text-xl font-semibold">Create / Update / Delete</h3>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {flavorRows.length} rows
            </span>
          </div>

          <form action={createEntityAction} className="mt-4 grid gap-2">
            <input type="hidden" name="entity_key" value="humor_flavors" />
            <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
            <label className="grid gap-1 text-xs text-slate-300">
              Create flavor payload (JSON)
              <textarea
                name="payload"
                rows={6}
                defaultValue={stringifyJson({ name: 'New flavor', description: 'Describe this flavor.' })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
            <button
              type="submit"
              className="w-fit rounded-xl border border-cyan-400/70 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
            >
              Create Flavor
            </button>
          </form>

          <div className="mt-4 space-y-3">
            {flavorRows.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm text-slate-400">
                No humor flavor rows found.
              </div>
            )}

            {flavorRows.map((row, index) => {
              const identifier = pickRowIdentifier(row)
              const rowJson = stringifyJson(row)
              const rowId = identifier ? asString(identifier.value) : ''
              const isSelected = selectedFlavorId && rowId === selectedFlavorId

              return (
                <article key={`flavor-row-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-slate-400">
                      {identifier ? `${identifier.column}: ${asString(identifier.value)}` : 'No row identifier found'}
                    </p>
                    {rowId && (
                      <Link
                        href={`/admin/prompt-chain?flavor=${encodeURIComponent(rowId)}`}
                        className={`rounded-md border px-2 py-1 text-xs transition ${
                          isSelected
                            ? 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select Flavor'}
                      </Link>
                    )}
                  </div>

                  <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-300">
                    {rowJson}
                  </pre>

                  {identifier && (
                    <form action={updateEntityAction} className="mt-3 grid gap-2">
                      <input type="hidden" name="entity_key" value="humor_flavors" />
                      <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
                      {selectedFlavorId && <input type="hidden" name="flavor_id" value={selectedFlavorId} />}
                      <input type="hidden" name="match_column" value={identifier.column} />
                      <input type="hidden" name="match_value" value={stringifyIdentifier(identifier.value)} />
                      <label className="grid gap-1 text-xs text-slate-300">
                        Update payload (JSON)
                        <textarea
                          name="payload"
                          rows={5}
                          defaultValue={rowJson}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="rounded-xl border border-cyan-500/70 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                        >
                          Update
                        </button>
                      </div>
                    </form>
                  )}

                  {identifier && (
                    <form action={deleteEntityAction} className="mt-2">
                      <input type="hidden" name="entity_key" value="humor_flavors" />
                      <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
                      {selectedFlavorId && <input type="hidden" name="flavor_id" value={selectedFlavorId} />}
                      <input type="hidden" name="match_column" value={identifier.column} />
                      <input type="hidden" name="match_value" value={stringifyIdentifier(identifier.value)} />
                      <button
                        type="submit"
                        className="rounded-xl border border-rose-500/60 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
                      >
                        Delete Flavor
                      </button>
                    </form>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Humor Flavor Steps</p>
              <h3 className="mt-1 text-xl font-semibold">CRUD + Reorder</h3>
              <p className="mt-1 text-xs text-slate-400">
                {selectedFlavorId
                  ? `Working flavor id: ${selectedFlavorId}`
                  : 'Select a flavor to focus step editing.'}
              </p>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {orderedSteps.length} rows
            </span>
          </div>

          {!stepOrderColumn && (
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Could not auto-detect a step order column. Reorder buttons will be hidden until a numeric order column is found.
            </div>
          )}
          {!stepFlavorRefColumn && (
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Could not auto-detect a flavor foreign-key column for steps. Filtering by selected flavor may be limited.
            </div>
          )}

          <form action={createEntityAction} className="mt-4 grid gap-2">
            <input type="hidden" name="entity_key" value="humor_flavor_steps" />
            <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
            {selectedFlavorId && <input type="hidden" name="flavor_id" value={selectedFlavorId} />}
            <label className="grid gap-1 text-xs text-slate-300">
              Create step payload (JSON)
              <textarea
                name="payload"
                rows={7}
                defaultValue={defaultStepPayload}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
            <button
              type="submit"
              className="w-fit rounded-xl border border-cyan-400/70 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
            >
              Create Step
            </button>
          </form>

          <div className="mt-4 space-y-3">
            {orderedSteps.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm text-slate-400">
                No step rows found for this flavor.
              </div>
            )}

            {orderedSteps.map((step, index) => {
              const rowJson = stringifyJson(step.row)
              const previous = orderedSteps[index - 1]
              const next = orderedSteps[index + 1]
              const canMoveUp =
                Boolean(stepOrderColumn) &&
                step.orderValue !== null &&
                Boolean(step.identifier) &&
                Boolean(previous?.identifier) &&
                previous?.orderValue !== null
              const canMoveDown =
                Boolean(stepOrderColumn) &&
                step.orderValue !== null &&
                Boolean(step.identifier) &&
                Boolean(next?.identifier) &&
                next?.orderValue !== null

              return (
                <article key={`step-row-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs text-slate-400">
                    {step.identifier
                      ? `${step.identifier.column}: ${asString(step.identifier.value)}`
                      : `row ${index + 1}`}
                    {step.orderValue !== null && stepOrderColumn ? ` | ${stepOrderColumn}: ${step.orderValue}` : ''}
                  </p>

                  <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-300">
                    {rowJson}
                  </pre>

                  {step.identifier && (
                    <form action={updateEntityAction} className="mt-3 grid gap-2">
                      <input type="hidden" name="entity_key" value="humor_flavor_steps" />
                      <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
                      {selectedFlavorId && <input type="hidden" name="flavor_id" value={selectedFlavorId} />}
                      <input type="hidden" name="match_column" value={step.identifier.column} />
                      <input type="hidden" name="match_value" value={stringifyIdentifier(step.identifier.value)} />
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
                        Update Step
                      </button>
                    </form>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2">
                    {canMoveUp && step.identifier && previous?.identifier && stepOrderColumn && (
                      <form action={reorderHumorFlavorStepAction}>
                        <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
                        {selectedFlavorId && <input type="hidden" name="flavor_id" value={selectedFlavorId} />}
                        <input type="hidden" name="order_column" value={stepOrderColumn} />
                        <input type="hidden" name="current_match_column" value={step.identifier.column} />
                        <input type="hidden" name="current_match_value" value={stringifyIdentifier(step.identifier.value)} />
                        <input type="hidden" name="target_match_column" value={previous.identifier.column} />
                        <input
                          type="hidden"
                          name="target_match_value"
                          value={stringifyIdentifier(previous.identifier.value)}
                        />
                        <input type="hidden" name="current_order" value={String(step.orderValue)} />
                        <input type="hidden" name="target_order" value={String(previous.orderValue)} />
                        <button
                          type="submit"
                          className="rounded-xl border border-slate-600 px-3 py-2 text-xs text-slate-100 transition hover:bg-slate-800"
                        >
                          Move Up
                        </button>
                      </form>
                    )}

                    {canMoveDown && step.identifier && next?.identifier && stepOrderColumn && (
                      <form action={reorderHumorFlavorStepAction}>
                        <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
                        {selectedFlavorId && <input type="hidden" name="flavor_id" value={selectedFlavorId} />}
                        <input type="hidden" name="order_column" value={stepOrderColumn} />
                        <input type="hidden" name="current_match_column" value={step.identifier.column} />
                        <input type="hidden" name="current_match_value" value={stringifyIdentifier(step.identifier.value)} />
                        <input type="hidden" name="target_match_column" value={next.identifier.column} />
                        <input type="hidden" name="target_match_value" value={stringifyIdentifier(next.identifier.value)} />
                        <input type="hidden" name="current_order" value={String(step.orderValue)} />
                        <input type="hidden" name="target_order" value={String(next.orderValue)} />
                        <button
                          type="submit"
                          className="rounded-xl border border-slate-600 px-3 py-2 text-xs text-slate-100 transition hover:bg-slate-800"
                        >
                          Move Down
                        </button>
                      </form>
                    )}

                    {step.identifier && (
                      <form action={deleteEntityAction}>
                        <input type="hidden" name="entity_key" value="humor_flavor_steps" />
                        <input type="hidden" name="redirect_to" value="/admin/prompt-chain" />
                        {selectedFlavorId && <input type="hidden" name="flavor_id" value={selectedFlavorId} />}
                        <input type="hidden" name="match_column" value={step.identifier.column} />
                        <input type="hidden" name="match_value" value={stringifyIdentifier(step.identifier.value)} />
                        <button
                          type="submit"
                          className="rounded-xl border border-rose-500/60 px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-500/20"
                        >
                          Delete Step
                        </button>
                      </form>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <PromptChainTester images={imageOptions} flavors={flavorOptions} defaultFlavorId={selectedFlavorId} />

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Captions</p>
        <h3 className="mt-1 text-xl font-semibold">Read Captions Produced By Flavor</h3>
        <p className="mt-1 text-xs text-slate-400">
          {captionFlavorRefColumn
            ? `Using caption column "${captionFlavorRefColumn}" for flavor filtering.`
            : 'No flavor reference column auto-detected in captions; showing latest rows without flavor filter.'}
        </p>

        <div className="mt-4 space-y-3">
          {captionRowsForFlavor.slice(0, 40).map((row, index) => (
            <article key={`caption-row-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <pre className="max-h-44 overflow-auto rounded-md border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-300">
                {stringifyJson(row)}
              </pre>
            </article>
          ))}

          {captionRowsForFlavor.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm text-slate-400">
              No caption rows found for this flavor filter.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
