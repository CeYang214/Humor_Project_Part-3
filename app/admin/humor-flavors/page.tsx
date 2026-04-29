import Link from 'next/link'

import {
  createHumorFlavorAction,
  createHumorFlavorStepAction,
  deleteHumorFlavorAction,
  deleteHumorFlavorStepAction,
  duplicateHumorFlavorAction,
  moveHumorFlavorStepAction,
  replaceHumorFlavorStepPromptWordAction,
  updateHumorFlavorStepPromptTextAction,
  updateHumorFlavorAction,
  updateHumorFlavorStepAction,
} from '@/app/admin/humor-flavors/actions'
import {
  GuidedFlavorCreateForm,
  GuidedFlavorUpdateForm,
  GuidedStepBuilderForm,
  PendingSubmitButton,
} from '@/app/admin/humor-flavors/guided-forms'
import { FlavorTester } from '@/app/admin/humor-flavors/flavor-tester'
import {
  CAPTION_FLAVOR_COLUMN_CANDIDATES,
  FLAVOR_DESCRIPTION_COLUMN_CANDIDATES,
  FLAVOR_NAME_COLUMN_CANDIDATES,
  HUMOR_FLAVOR_STEP_TABLE_CANDIDATES,
  HUMOR_FLAVOR_TABLE_CANDIDATES,
  STEP_INPUT_TYPE_COLUMN_CANDIDATES,
  STEP_MODEL_COLUMN_CANDIDATES,
  STEP_OUTPUT_TYPE_COLUMN_CANDIDATES,
  STEP_FLAVOR_COLUMN_CANDIDATES,
  STEP_ORDER_COLUMN_CANDIDATES,
  STEP_PROMPT_COLUMN_CANDIDATES,
  STEP_TEMPERATURE_COLUMN_CANDIDATES,
  STEP_TYPE_COLUMN_CANDIDATES,
  asCleanString,
  pickFirstExistingColumn,
  pickFlavorDescription,
  pickFlavorName,
  pickIdentifierColumn,
  pickStepPrompt,
  pickStepOrderValue,
  resolveFirstExistingColumn,
  resolveFirstExistingTable,
  sortStepsByOrder,
  stringifyJson,
  stringifyPayloadObject,
} from '@/lib/admin/humor-flavors'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

type DataRow = Record<string, unknown>
type HumorFlavorAdminView = 'all' | 'flavors' | 'steps' | 'captions' | 'tester' | 'directory'
const GUIDED_STEP_TEMPLATE =
  'Describe [SUBJECT] in neutral language, then write one [TONE] caption focused on [FOCUS]. Keep it under [MAX_WORDS] words.'

interface HumorFlavorsPageProps {
  searchParams: Promise<{
    status?: string
    message?: string
    flavor?: string
    view?: string
    flavor_q?: string
  }>
}

function normalizeHumorFlavorAdminView(value: string): HumorFlavorAdminView {
  const trimmed = value.trim().toLowerCase()
  const validViews: HumorFlavorAdminView[] = ['all', 'flavors', 'steps', 'captions', 'tester', 'directory']
  return validViews.includes(trimmed as HumorFlavorAdminView) ? (trimmed as HumorFlavorAdminView) : 'flavors'
}

function buildHumorFlavorAdminHref(view: HumorFlavorAdminView, flavorId?: string, flavorQuery?: string) {
  const params = new URLSearchParams()
  if (view !== 'all') {
    params.set('view', view)
  }
  if (flavorId) {
    params.set('flavor', flavorId)
  }
  if (flavorQuery && flavorQuery.trim()) {
    params.set('flavor_q', flavorQuery.trim())
  }
  const query = params.toString()
  return query ? `/admin/humor-flavors?${query}` : '/admin/humor-flavors'
}

function getCaptionText(row: DataRow) {
  for (const key of ['content', 'caption', 'text', 'title', 'caption_text']) {
    const value = asCleanString(row[key])
    if (value) return value
  }
  return '(no caption text)'
}

function findMatchingFlavorId(row: DataRow, selectedFlavorId: string, selectedFlavorName: string) {
  const normalizedSelectedId = selectedFlavorId.trim()
  const selectedIdNumber = Number(normalizedSelectedId)
  const hasNumericSelectedId = normalizedSelectedId !== '' && Number.isFinite(selectedIdNumber)

  for (const key of STEP_FLAVOR_COLUMN_CANDIDATES) {
    if (!(key in row)) continue

    const rawValue = row[key]
    const value = asCleanString(rawValue)
    if (!value) continue

    if (value === normalizedSelectedId || value === selectedFlavorName) {
      return true
    }

    if (hasNumericSelectedId) {
      const rowNumber = typeof rawValue === 'number' ? rawValue : Number(value)
      if (Number.isFinite(rowNumber) && rowNumber === selectedIdNumber) {
        return true
      }
    }
  }

  return false
}

function matchesFlavorSelection(row: DataRow, selectedValue: string, flavorIdColumn: string) {
  if (!selectedValue) return false

  if (asCleanString(row[flavorIdColumn]) === selectedValue) {
    return true
  }

  for (const key of FLAVOR_NAME_COLUMN_CANDIDATES) {
    if (asCleanString(row[key]) === selectedValue) {
      return true
    }
  }

  return false
}

function formatDate(value: unknown) {
  const text = asCleanString(value)
  if (!text) return 'n/a'

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function getFlavorSortTime(row: DataRow) {
  const dateCandidates = [
    row.created_datetime_utc,
    row.modified_datetime_utc,
    row.created_at,
    row.updated_at,
  ]

  for (const candidate of dateCandidates) {
    const text = asCleanString(candidate)
    if (!text) continue
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime()
    }
  }

  return Number.NaN
}

async function loadAllTestImages(
  supabase: Awaited<ReturnType<typeof requireSuperadminOrMatrixAdmin>>['supabase']
) {
  const pageSize = 500
  const maxPages = 20
  const collected: DataRow[] = []

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('images')
      .select('id, url')
      .range(from, to)

    if (error) {
      return { data: collected, error }
    }

    const chunk = (data ?? []) as DataRow[]
    if (chunk.length === 0) {
      break
    }

    collected.push(...chunk)

    if (chunk.length < pageSize) {
      break
    }
  }

  return { data: collected, error: null }
}

export default async function HumorFlavorsAdminPage({ searchParams }: HumorFlavorsPageProps) {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const params = await searchParams

  const bannerStatus = params.status === 'success' ? 'success' : params.status === 'error' ? 'error' : null
  const bannerMessage = asCleanString(params.message)
  const flavorSearchRaw = asCleanString(params.flavor_q)
  const flavorSearchLower = flavorSearchRaw.toLowerCase()
  const activeView = normalizeHumorFlavorAdminView(asCleanString(params.view))
  const showAll = activeView === 'all'
  const showFlavors = showAll || activeView === 'flavors'
  const showSteps = showAll || activeView === 'steps'
  const showCaptions = showAll || activeView === 'captions'
  const showTester = showAll || activeView === 'tester'
  const showDirectory = showAll || activeView === 'directory'
  const shouldLoadStepData = showSteps
  const shouldLoadCaptionRows = showCaptions
  const shouldResolveCaptionFlavorColumn = showCaptions || showTester
  const shouldLoadImages = showTester
  const viewOptions: Array<{ key: HumorFlavorAdminView; label: string }> = [
    { key: 'all', label: 'All Sections' },
    { key: 'flavors', label: 'Flavor CRUD' },
    { key: 'steps', label: 'Step Builder' },
    { key: 'captions', label: 'Caption Readout' },
    { key: 'tester', label: 'Prompt Tester' },
    { key: 'directory', label: 'Flavor Directory' },
  ]

  const [flavorTableResolution, stepTableResolution] = await Promise.all([
    resolveFirstExistingTable(supabase, HUMOR_FLAVOR_TABLE_CANDIDATES),
    shouldLoadStepData
      ? resolveFirstExistingTable(supabase, HUMOR_FLAVOR_STEP_TABLE_CANDIDATES)
      : Promise.resolve({ tableName: null, errorMessage: null }),
  ])

  const flavorRowsPromise = flavorTableResolution.tableName
    ? supabase.from(flavorTableResolution.tableName).select('*').limit(400)
    : Promise.resolve({ data: [], error: null })
  const stepRowsPromise = shouldLoadStepData && stepTableResolution.tableName
    ? supabase.from(stepTableResolution.tableName).select('*').limit(800)
    : Promise.resolve({ data: [], error: null })
  const imageRowsPromise = shouldLoadImages
    ? loadAllTestImages(supabase)
    : Promise.resolve({ data: [], error: null })
  const captionRowsPromise = shouldLoadCaptionRows
    ? (async () => {
        let captionRowsResult = await supabase
          .from('captions')
          .select('*')
          .order('created_datetime_utc', { ascending: false })
          .limit(300)

        if (captionRowsResult.error && /column .* does not exist/i.test(captionRowsResult.error.message)) {
          captionRowsResult = await supabase.from('captions').select('*').limit(300)
        }
        return captionRowsResult
      })()
    : Promise.resolve({ data: [], error: null })

  const [flavorRowsResult, stepRowsResult, imageRowsResult, captionRowsResult] = await Promise.all([
    flavorRowsPromise,
    stepRowsPromise,
    imageRowsPromise,
    captionRowsPromise,
  ])

  const flavorRows = ((flavorRowsResult.data ?? []) as DataRow[])
    .filter((row) => Object.keys(row).length > 0)
    .sort((a, b) => {
      const aTime = getFlavorSortTime(a)
      const bTime = getFlavorSortTime(b)

      if (!Number.isNaN(aTime) || !Number.isNaN(bTime)) {
        if (Number.isNaN(aTime)) return 1
        if (Number.isNaN(bTime)) return -1
        if (aTime !== bTime) return bTime - aTime
      }

      const aId = Number(asCleanString(a.id))
      const bId = Number(asCleanString(b.id))
      if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
        return bId - aId
      }

      return pickFlavorName(a).localeCompare(pickFlavorName(b))
    })

  const stepRows = ((stepRowsResult.data ?? []) as DataRow[])
    .filter((row) => Object.keys(row).length > 0)

  const flavorIdColumn = pickIdentifierColumn(flavorRows)
  const stepIdColumn = pickIdentifierColumn(stepRows)
  const [
    stepFlavorColumn,
    stepOrderColumn,
    stepPromptColumn,
    stepModelColumn,
    stepInputTypeColumn,
    stepOutputTypeColumn,
    stepTypeColumn,
    stepTemperatureColumn,
    flavorNameColumn,
    flavorDescriptionColumn,
  ] = await Promise.all([
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_FLAVOR_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return 'humor_flavor_id'
      return (await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_FLAVOR_COLUMN_CANDIDATES)) ?? 'humor_flavor_id'
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_ORDER_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return 'step_order'
      return (await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_ORDER_COLUMN_CANDIDATES)) ?? 'step_order'
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_PROMPT_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return null
      return await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_PROMPT_COLUMN_CANDIDATES)
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_MODEL_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return null
      return await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_MODEL_COLUMN_CANDIDATES)
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_INPUT_TYPE_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return null
      return await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_INPUT_TYPE_COLUMN_CANDIDATES)
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_OUTPUT_TYPE_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return null
      return await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_OUTPUT_TYPE_COLUMN_CANDIDATES)
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_TYPE_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return null
      return await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_TYPE_COLUMN_CANDIDATES)
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(stepRows, STEP_TEMPERATURE_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!stepTableResolution.tableName) return null
      return await resolveFirstExistingColumn(supabase, stepTableResolution.tableName, STEP_TEMPERATURE_COLUMN_CANDIDATES)
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(flavorRows, FLAVOR_NAME_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!flavorTableResolution.tableName) return 'slug'
      return (await resolveFirstExistingColumn(supabase, flavorTableResolution.tableName, FLAVOR_NAME_COLUMN_CANDIDATES)) ?? 'slug'
    })(),
    (async () => {
      const fromRows = pickFirstExistingColumn(flavorRows, FLAVOR_DESCRIPTION_COLUMN_CANDIDATES)
      if (fromRows) return fromRows
      if (!flavorTableResolution.tableName) return 'description'
      return (await resolveFirstExistingColumn(supabase, flavorTableResolution.tableName, FLAVOR_DESCRIPTION_COLUMN_CANDIDATES)) ?? 'description'
    })(),
  ])

  const selectedFlavorFromQuery = asCleanString(params.flavor)
  const firstFlavorId = flavorRows.length > 0 ? asCleanString(flavorRows[0][flavorIdColumn]) : ''

  const selectedFlavor = selectedFlavorFromQuery
    ? flavorRows.find((row) => matchesFlavorSelection(row, selectedFlavorFromQuery, flavorIdColumn)) ?? null
    : (flavorRows[0] ?? null)
  const selectedFlavorId = selectedFlavor ? asCleanString(selectedFlavor[flavorIdColumn]) : firstFlavorId
  const selectedFlavorName = selectedFlavor ? pickFlavorName(selectedFlavor) : ''

  const selectedFlavorSteps = selectedFlavor
    ? sortStepsByOrder(
        stepRows.filter((row) => findMatchingFlavorId(row, selectedFlavorId, selectedFlavorName)),
        stepOrderColumn
      )
    : []

  const maxStepOrder = selectedFlavorSteps.reduce((acc, row) => {
    const value = pickStepOrderValue(row, stepOrderColumn)
    if (!Number.isFinite(value) || value === Number.MAX_SAFE_INTEGER) return acc
    return Math.max(acc, value)
  }, 0)

  const templateStepForDefaults = selectedFlavorSteps[0] ?? stepRows[0] ?? null

  const defaultFlavorPayload = stringifyPayloadObject({
    [flavorNameColumn]: 'Sarcastic Dry Humor',
    [flavorDescriptionColumn]: 'Step-based prompt chain for short, sharp captions.',
  })

  const defaultStepPayloadObject: Record<string, unknown> = {
    [stepFlavorColumn]: selectedFlavorId || '<replace-with-flavor-id>',
    [stepOrderColumn]: maxStepOrder + 1,
  }
  if (stepPromptColumn) {
    defaultStepPayloadObject[stepPromptColumn] = 'Describe the image in neutral language before adding humor.'
  }
  if (stepModelColumn && templateStepForDefaults?.[stepModelColumn] !== undefined) {
    defaultStepPayloadObject[stepModelColumn] = templateStepForDefaults[stepModelColumn]
  }
  if (stepInputTypeColumn && templateStepForDefaults?.[stepInputTypeColumn] !== undefined) {
    defaultStepPayloadObject[stepInputTypeColumn] = templateStepForDefaults[stepInputTypeColumn]
  }
  if (stepOutputTypeColumn && templateStepForDefaults?.[stepOutputTypeColumn] !== undefined) {
    defaultStepPayloadObject[stepOutputTypeColumn] = templateStepForDefaults[stepOutputTypeColumn]
  }
  if (stepTypeColumn && templateStepForDefaults?.[stepTypeColumn] !== undefined) {
    defaultStepPayloadObject[stepTypeColumn] = templateStepForDefaults[stepTypeColumn]
  }
  if (stepTemperatureColumn && templateStepForDefaults?.[stepTemperatureColumn] !== undefined) {
    defaultStepPayloadObject[stepTemperatureColumn] = templateStepForDefaults[stepTemperatureColumn]
  }
  const defaultStepPayload = stringifyPayloadObject(defaultStepPayloadObject)

  const captions = (captionRowsResult.data ?? []) as DataRow[]
  const captionFlavorColumn = shouldResolveCaptionFlavorColumn
    ? pickFirstExistingColumn(captions, CAPTION_FLAVOR_COLUMN_CANDIDATES)
      ?? (await resolveFirstExistingColumn(supabase, 'captions', CAPTION_FLAVOR_COLUMN_CANDIDATES))
    : null
  const flavorCaptions = selectedFlavor
    ? captions.filter((row) => {
        if (!captionFlavorColumn) return false
        const value = asCleanString(row[captionFlavorColumn])
        return value === selectedFlavorId || value === selectedFlavorName
      })
    : []

  const flavorOptions = flavorRows
    .map((row) => ({
      id: asCleanString(row[flavorIdColumn]),
      name: pickFlavorName(row),
    }))
    .filter((option) => option.id)

  const testImages = ((imageRowsResult.data ?? []) as DataRow[])
    .map((row) => ({
      id: asCleanString(row.id),
      url: asCleanString(row.url),
    }))
    .filter((row) => row.id && row.url)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Prompt Chains</p>
        <h2 className="mt-2 text-xl font-semibold">Humor Flavor Tooling</h2>
        <p className="mt-2 text-sm text-slate-300">
          Create, edit, delete, and reorder humor flavor prompt-chain steps, then run a caption test set through
          `api.almostcrackd.ai`.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Access is gated to `profiles.is_superadmin == TRUE` or `profiles.is_matrix_admin == TRUE`.
        </p>
      </section>

      {bannerStatus && bannerMessage && (
        <section
          className={`admin-banner whitespace-pre-wrap break-words rounded-xl border px-4 py-3 text-sm ${
            bannerStatus === 'success'
              ? 'admin-banner-success border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
              : 'admin-banner-error border-rose-400/40 bg-rose-500/10 text-rose-100'
          }`}
        >
          {bannerMessage}
        </section>
      )}

      {(flavorTableResolution.errorMessage || stepTableResolution.errorMessage) && (
        <section className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {flavorTableResolution.errorMessage && <p>Flavor table: {flavorTableResolution.errorMessage}</p>}
          {stepTableResolution.errorMessage && <p>Step table: {stepTableResolution.errorMessage}</p>}
        </section>
      )}

      <section className="admin-view-filter-panel rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
        <p className="admin-view-filter-label text-xs uppercase tracking-[0.16em] text-cyan-200">View Filter</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {viewOptions.map((option) => {
            const isActive = option.key === activeView
            return (
              <Link
                key={option.key}
                href={buildHumorFlavorAdminHref(option.key, selectedFlavorId || undefined, flavorSearchRaw)}
                className={`admin-view-filter-btn rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'admin-view-filter-btn-active border-cyan-300 bg-cyan-600 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                    : 'border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-400 hover:bg-slate-800'
                }`}
              >
                {option.label}
              </Link>
            )
          })}
        </div>
      </section>

      {showFlavors && (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Humor Flavors</p>
            <h3 className="mt-1 text-xl font-semibold">Flavor CRUD</h3>
            <p className="mt-1 text-sm text-slate-300">
              Table: {flavorTableResolution.tableName ?? HUMOR_FLAVOR_TABLE_CANDIDATES[0]} | ID column: {flavorIdColumn}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Detected flavor name column: {flavorNameColumn} | description column: {flavorDescriptionColumn}
            </p>
            <p className="mt-1 text-xs text-slate-400">Flavors are sorted newest first.</p>
          </div>
          <Link
            href="/admin/operations/humor_flavors"
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            Open Generic Operations
          </Link>
        </div>

        <section className="mt-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-100">Guided Flavor Builder</p>
          <h4 className="mt-1 text-base font-semibold text-slate-100">Only Change Name + Description</h4>
          <p className="mt-1 text-xs text-slate-300">
            The row format is handled for you. Fill these fields to create a flavor without editing payload syntax.
          </p>
          <GuidedFlavorCreateForm
            action={createHumorFlavorAction}
            flavorNameColumn={flavorNameColumn}
            flavorDescriptionColumn={flavorDescriptionColumn}
            defaultName="Sarcastic Dry Humor"
            defaultDescription="Step-based prompt chain for short, sharp captions."
          />
        </section>

        <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Advanced: raw payload editor</summary>
          <form action={createHumorFlavorAction} className="mt-3 grid gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Create flavor payload (`column: value` per line; JSON also works)</span>
              <textarea
                name="payload"
                rows={6}
                defaultValue={defaultFlavorPayload}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
            <PendingSubmitButton
              idleLabel="Create Flavor (Payload)"
              pendingLabel="Creating Flavor..."
              className="w-fit rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </form>
        </details>

        {selectedFlavor && (
          <article className="admin-selected-flavor-card mt-5 rounded-xl border border-cyan-400/60 bg-cyan-600/20 p-4">
            <p className="admin-selected-flavor-label text-xs uppercase tracking-[0.16em] text-slate-100">Selected Flavor</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{selectedFlavorName}</p>
            <p className="mt-1 text-xs text-slate-200" title={selectedFlavorId}>
              id: {selectedFlavorId}
            </p>

            <section className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
              <p className="text-xs text-slate-100">Quick Update</p>
              <GuidedFlavorUpdateForm
                action={updateHumorFlavorAction}
                flavorId={selectedFlavorId}
                idColumn={flavorIdColumn}
                flavorNameColumn={flavorNameColumn}
                flavorDescriptionColumn={flavorDescriptionColumn}
                defaultName={pickFlavorName(selectedFlavor)}
                defaultDescription={pickFlavorDescription(selectedFlavor)}
              />
            </section>

            <details className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-200">Advanced: edit full flavor row payload</summary>
              <form action={updateHumorFlavorAction} className="mt-2 grid gap-2">
                <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                <input type="hidden" name="id_column" value={flavorIdColumn} />
                <label className="grid gap-1 text-xs text-slate-300">
                  Update selected flavor (`column: value` per line; JSON also works)
                  <textarea
                    name="payload"
                    rows={8}
                    defaultValue={stringifyPayloadObject(selectedFlavor)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </label>
                <PendingSubmitButton
                  idleLabel="Update Flavor (Payload)"
                  pendingLabel="Updating Flavor..."
                  className="w-fit rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </form>
            </details>

            <form action={duplicateHumorFlavorAction} className="mt-3 grid gap-2">
              <input type="hidden" name="source_flavor_id" value={selectedFlavorId} />
              <input type="hidden" name="source_id_column" value={flavorIdColumn} />
              <label className="grid gap-1 text-xs text-slate-300">
                Duplicate flavor as (unique name)
                <input
                  name="new_flavor_name"
                  defaultValue={`${selectedFlavorName} Copy`}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
                />
              </label>
              <button
                type="submit"
                className="admin-accent-btn w-fit rounded-lg border border-cyan-500/60 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Duplicate Flavor + Steps
              </button>
            </form>

            <form action={deleteHumorFlavorAction} className="mt-2">
              <input type="hidden" name="flavor_id" value={selectedFlavorId} />
              <input type="hidden" name="id_column" value={flavorIdColumn} />
              <button
                type="submit"
                className="admin-danger-btn rounded-lg border border-rose-500/60 px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-500/20"
              >
                Delete Selected Flavor
              </button>
            </form>
          </article>
        )}
      </section>
      )}

      {showSteps && (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Humor Flavor Steps</p>
        <h3 className="mt-1 text-xl font-semibold">Step Builder + Reordering</h3>
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-200">Recommended Flow</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-300">
            <li>Select a flavor in Flavor Directory.</li>
            <li>Create steps with Guided Step Builder.</li>
            <li>Reorder steps with Up/Down or Move To.</li>
            <li>Use Quick Replace for word swaps; use Advanced payload only for full-row edits.</li>
          </ol>
        </div>

        {selectedFlavor ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <span>Selected flavor:</span>
              <span className="admin-step-selected-flavor inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold">
                {selectedFlavorName}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Step table: {stepTableResolution.tableName ?? HUMOR_FLAVOR_STEP_TABLE_CANDIDATES[0]} | id column: {stepIdColumn} |
              flavor column: {stepFlavorColumn} | order column: {stepOrderColumn} | step text column: {stepPromptColumn ?? 'not detected'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              LLM columns: model={stepModelColumn ?? 'n/a'} | input={stepInputTypeColumn ?? 'n/a'} | output={stepOutputTypeColumn ?? 'n/a'} | stepType={stepTypeColumn ?? 'n/a'} | temp={stepTemperatureColumn ?? 'n/a'}
            </p>

            <section className="mt-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-100">Guided Step Builder</p>
              <h4 className="mt-1 text-base font-semibold text-slate-100">Only Change Specific Words</h4>
              <p className="mt-1 text-xs text-slate-300">
                Use this form if you want the format provided automatically. You only edit a few words and the step payload is generated.
              </p>
              {stepPromptColumn ? (
                <GuidedStepBuilderForm
                  action={createHumorFlavorStepAction}
                  flavorId={selectedFlavorId}
                  flavorColumn={stepFlavorColumn}
                  orderColumn={stepOrderColumn}
                  promptColumn={stepPromptColumn}
                  defaultTone={selectedFlavorName || 'playful'}
                  defaultTemplate={GUIDED_STEP_TEMPLATE}
                />
              ) : (
                <p className="mt-3 text-xs text-amber-200">
                  Could not detect the step prompt column for this table, so guided creation is unavailable. Use the raw payload editor below.
                </p>
              )}
            </section>

            <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">Advanced: raw payload editor</summary>
              <form action={createHumorFlavorStepAction} className="mt-3 grid gap-2">
                <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                <input type="hidden" name="flavor_column" value={stepFlavorColumn} />
                <input type="hidden" name="order_column" value={stepOrderColumn} />
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">Create step payload (`column: value` per line; JSON also works)</span>
                  <textarea
                    name="payload"
                    rows={6}
                    defaultValue={defaultStepPayload}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </label>
                <PendingSubmitButton
                  idleLabel="Create Step (Payload)"
                  pendingLabel="Creating Step..."
                  className="w-fit rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </form>
            </details>

            <div className="mt-5 space-y-3">
              {selectedFlavorSteps.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
                  No steps found for this flavor.
                </div>
              )}

              {selectedFlavorSteps.map((row, index) => {
                const stepId = asCleanString(row[stepIdColumn])
                const orderValue = pickStepOrderValue(row, stepOrderColumn)
                const orderLabel = Number.isFinite(orderValue) && orderValue !== Number.MAX_SAFE_INTEGER
                  ? String(orderValue)
                  : String(index + 1)

                return (
                  <article key={stepId || `${index}-${stringifyJson(row)}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-400">
                          Step {index + 1} | order: {orderLabel} | step_id: {stepId || 'n/a'}
                        </p>
                        <p className="mt-1 text-sm text-slate-200">{(stepPromptColumn ? asCleanString(row[stepPromptColumn]) : '') || pickStepPrompt(row) || '(no prompt text)'}</p>
                      </div>
                      <div className="grid gap-1">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Reorder</p>
                        <div className="flex flex-wrap gap-2">
                        <form action={moveHumorFlavorStepAction}>
                          <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                          <input type="hidden" name="step_id" value={stepId} />
                          <input type="hidden" name="id_column" value={stepIdColumn} />
                          <input type="hidden" name="flavor_column" value={stepFlavorColumn} />
                          <input type="hidden" name="order_column" value={stepOrderColumn} />
                          <input type="hidden" name="direction" value="up" />
                          <button
                            type="submit"
                            className="admin-neutral-btn rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-500"
                          >
                            Up
                          </button>
                        </form>
                        <form action={moveHumorFlavorStepAction}>
                          <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                          <input type="hidden" name="step_id" value={stepId} />
                          <input type="hidden" name="id_column" value={stepIdColumn} />
                          <input type="hidden" name="flavor_column" value={stepFlavorColumn} />
                          <input type="hidden" name="order_column" value={stepOrderColumn} />
                          <input type="hidden" name="direction" value="down" />
                          <button
                            type="submit"
                            className="admin-neutral-btn rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-500"
                          >
                            Down
                          </button>
                        </form>
                        <form action={moveHumorFlavorStepAction} className="flex items-center gap-1">
                          <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                          <input type="hidden" name="step_id" value={stepId} />
                          <input type="hidden" name="id_column" value={stepIdColumn} />
                          <input type="hidden" name="flavor_column" value={stepFlavorColumn} />
                          <input type="hidden" name="order_column" value={stepOrderColumn} />
                          <span className="text-xs text-slate-300">Move To</span>
                          <input
                            type="number"
                            name="target_position"
                            min={1}
                            defaultValue={index + 1}
                            placeholder="#"
                            aria-label="Target position number"
                            className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                          />
                          <button
                            type="submit"
                            className="admin-neutral-btn rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-500"
                          >
                            Apply
                          </button>
                        </form>
                      </div>
                      </div>
                    </div>

                    {stepPromptColumn && (
                      <section className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                        <p className="text-xs text-slate-300">Edit prompt text directly (recommended).</p>
                        <form action={updateHumorFlavorStepPromptTextAction} className="grid gap-2">
                          <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                          <input type="hidden" name="step_id" value={stepId} />
                          <input type="hidden" name="id_column" value={stepIdColumn} />
                          <input type="hidden" name="prompt_column" value={stepPromptColumn} />
                          <textarea
                            name="prompt_text"
                            rows={4}
                            defaultValue={asCleanString(row[stepPromptColumn]) || pickStepPrompt(row)}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
                          />
                          <div>
                            <button
                              type="submit"
                              className="admin-accent-btn rounded-lg border border-cyan-500/60 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-500/20"
                            >
                              Save Prompt Text
                            </button>
                          </div>
                        </form>

                        <details className="rounded-lg border border-slate-700 bg-slate-900/60 p-2">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-200">Advanced: replace one specific word</summary>
                          <form action={replaceHumorFlavorStepPromptWordAction} className="mt-2 grid gap-2">
                            <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                            <input type="hidden" name="step_id" value={stepId} />
                            <input type="hidden" name="id_column" value={stepIdColumn} />
                            <input type="hidden" name="prompt_column" value={stepPromptColumn} />
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                              <input
                                name="from_word"
                                placeholder="word to replace"
                                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                              />
                              <input
                                name="to_word"
                                placeholder="new word"
                                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                              />
                              <button
                                type="submit"
                                className="admin-neutral-btn rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-500"
                              >
                                Replace Word
                              </button>
                            </div>
                          </form>
                        </details>
                      </section>
                    )}

                    <details className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-200">Advanced: edit full step payload</summary>
                      <form action={updateHumorFlavorStepAction} className="mt-2 grid gap-2">
                        <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                        <input type="hidden" name="step_id" value={stepId} />
                        <input type="hidden" name="id_column" value={stepIdColumn} />
                        <label className="grid gap-1 text-xs text-slate-300">
                          Update step row (`column: value` per line; JSON also works)
                          <textarea
                            name="payload"
                            rows={8}
                            defaultValue={stringifyPayloadObject(row)}
                            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            className="admin-accent-btn rounded-lg border border-cyan-500/60 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-500/20"
                          >
                            Update Step
                          </button>
                        </div>
                      </form>
                    </details>

                    <form action={deleteHumorFlavorStepAction} className="mt-2">
                      <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                      <input type="hidden" name="step_id" value={stepId} />
                      <input type="hidden" name="id_column" value={stepIdColumn} />
                      <button
                        type="submit"
                        className="admin-danger-btn rounded-lg border border-rose-500/60 px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-500/20"
                      >
                        Delete Step
                      </button>
                    </form>
                  </article>
                )
              })}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-300">Create a flavor first, then select it to manage steps.</p>
        )}
      </section>
      )}

      {showCaptions && (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Caption Readout</p>
        <h3 className="mt-1 text-xl font-semibold">Captions Produced By Selected Flavor</h3>
        <p className="mt-1 text-sm text-slate-300">
          {selectedFlavor
            ? `Showing captions for flavor "${selectedFlavorName}" when a flavor column is available in captions table.`
            : 'Select a flavor to see caption rows mapped to it.'}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Detected caption flavor column: {captionFlavorColumn ?? 'none found'}
        </p>

        {captionRowsResult.error && (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Failed to load captions: {captionRowsResult.error.message}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {selectedFlavor && captionFlavorColumn && flavorCaptions.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
              No caption rows matched this flavor yet.
            </div>
          )}
          {(!selectedFlavor || !captionFlavorColumn) && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
              Flavor-specific caption filtering is unavailable until a flavor is selected and a flavor column is present in
              `captions`.
            </div>
          )}

          {flavorCaptions.slice(0, 80).map((row, index) => {
            const captionId = asCleanString(row.id) || `caption-${index}`
            return (
              <article key={captionId} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-sm text-slate-100">{getCaptionText(row)}</p>
                <p className="mt-2 text-xs text-slate-400">
                  id: {captionId} | created: {formatDate(row.created_datetime_utc ?? row.created_at)}
                </p>
              </article>
            )
          })}
        </div>
      </section>
      )}

      {showTester && (
        flavorOptions.length > 0 && testImages.length > 0 ? (
          <FlavorTester
            flavors={flavorOptions}
            images={testImages}
            defaultFlavorId={selectedFlavorId || flavorOptions[0].id}
            captionFlavorColumn={captionFlavorColumn}
          />
        ) : (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-sm text-slate-300">
            The prompt-chain tester needs at least one flavor and one image URL in your database.
            {imageRowsResult.error && <p className="mt-2 text-amber-200">Image load error: {imageRowsResult.error.message}</p>}
          </section>
        )
      )}

      {showDirectory && (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Flavor Directory</p>
        <h3 className="mt-1 text-xl font-semibold">Pick Flavor To Manage</h3>
        <p className="mt-1 text-sm text-slate-300">Newest flavors are listed first.</p>

        <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          {activeView !== 'all' && <input type="hidden" name="view" value={activeView} />}
          {selectedFlavorId && <input type="hidden" name="flavor" value={selectedFlavorId} />}
          <label className="grid gap-1 text-xs text-slate-300">
            Search flavors
            <input
              name="flavor_q"
              defaultValue={flavorSearchRaw}
              placeholder="Search by name, id, or description..."
              className="w-72 max-w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <button
            type="submit"
            className="admin-neutral-btn rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-500"
          >
            Search
          </button>
          {flavorSearchRaw && (
            <Link
              href={buildHumorFlavorAdminHref(activeView, selectedFlavorId || undefined)}
              className="admin-neutral-btn rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-500"
            >
              Clear
            </Link>
          )}
        </form>

        <div className="mt-4 space-y-2">
          {(() => {
            const filteredFlavorRows = flavorSearchLower
              ? flavorRows.filter((row) => {
                  const flavorId = asCleanString(row[flavorIdColumn]).toLowerCase()
                  const label = pickFlavorName(row).toLowerCase()
                  const description = pickFlavorDescription(row).toLowerCase()
                  return (
                    flavorId.includes(flavorSearchLower)
                    || label.includes(flavorSearchLower)
                    || description.includes(flavorSearchLower)
                  )
                })
              : flavorRows

            if (filteredFlavorRows.length === 0) {
              return (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
                  {flavorSearchRaw ? 'No flavors match your search.' : 'No flavor rows found.'}
                </div>
              )
            }

            return filteredFlavorRows.map((row) => {
              const flavorId = asCleanString(row[flavorIdColumn])
              const isSelected = flavorId === selectedFlavorId
              const label = pickFlavorName(row)
              const description = pickFlavorDescription(row)

              return (
                <article key={flavorId || JSON.stringify(row)} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{label}</p>
                    <p className="mt-1 truncate text-xs text-slate-400" title={flavorId}>
                      id: {flavorId || 'No id value'}
                    </p>
                    {description && (
                      <p className="mt-1 truncate text-xs text-slate-300" title={description}>
                        {description}
                      </p>
                    )}
                  </div>
                  <Link
                    href={buildHumorFlavorAdminHref(activeView, flavorId, flavorSearchRaw)}
                    className={`admin-select-flavor-btn mt-3 inline-flex w-full items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? 'admin-select-flavor-btn-active border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                        : 'border-slate-700 text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    {isSelected ? 'Selected Flavor' : 'Select Flavor'}
                  </Link>
                </article>
              )
            })
          })()}
        </div>
      </section>
      )}
    </div>
  )
}
