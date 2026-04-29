import Link from 'next/link'

import {
  createHumorFlavorAction,
  createHumorFlavorStepAction,
  deleteHumorFlavorAction,
  deleteHumorFlavorStepAction,
  duplicateHumorFlavorAction,
  moveHumorFlavorStepAction,
  replaceHumorFlavorStepPromptWordAction,
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
} from '@/lib/admin/humor-flavors'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

type DataRow = Record<string, unknown>
const GUIDED_STEP_TEMPLATE =
  'Describe [SUBJECT] in neutral language, then write one [TONE] caption focused on [FOCUS]. Keep it under [MAX_WORDS] words.'

interface HumorFlavorsPageProps {
  searchParams: Promise<{
    status?: string
    message?: string
    flavor?: string
  }>
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

export default async function HumorFlavorsAdminPage({ searchParams }: HumorFlavorsPageProps) {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const params = await searchParams

  const flavorTableResolution = await resolveFirstExistingTable(supabase, HUMOR_FLAVOR_TABLE_CANDIDATES)
  const stepTableResolution = await resolveFirstExistingTable(supabase, HUMOR_FLAVOR_STEP_TABLE_CANDIDATES)

  const flavorRowsResult = flavorTableResolution.tableName
    ? await supabase.from(flavorTableResolution.tableName).select('*').limit(400)
    : { data: [], error: null }

  const stepRowsResult = stepTableResolution.tableName
    ? await supabase.from(stepTableResolution.tableName).select('*').limit(800)
    : { data: [], error: null }

  const imageRowsResult = await supabase.from('images').select('id, url').limit(60)

  let captionRowsResult = await supabase
    .from('captions')
    .select('*')
    .order('created_datetime_utc', { ascending: false })
    .limit(300)

  if (captionRowsResult.error && /column .* does not exist/i.test(captionRowsResult.error.message)) {
    captionRowsResult = await supabase.from('captions').select('*').limit(300)
  }

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

  const defaultFlavorPayload = stringifyJson({
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
  const defaultStepPayload = stringifyJson(defaultStepPayloadObject)

  const captions = (captionRowsResult.data ?? []) as DataRow[]
  const captionFlavorColumn = pickFirstExistingColumn(captions, CAPTION_FLAVOR_COLUMN_CANDIDATES)
    ?? (await resolveFirstExistingColumn(supabase, 'captions', CAPTION_FLAVOR_COLUMN_CANDIDATES))
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

  const bannerStatus = params.status === 'success' ? 'success' : params.status === 'error' ? 'error' : null
  const bannerMessage = asCleanString(params.message)

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
            href="/admin/operations?entity=humor_flavors"
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            Open Generic Operations
          </Link>
        </div>

        <section className="mt-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Guided Flavor Builder</p>
          <h4 className="mt-1 text-base font-semibold text-slate-100">Only Change Name + Description</h4>
          <p className="mt-1 text-xs text-slate-300">
            The row format is handled for you. Fill these fields to create a flavor without editing JSON.
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
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Advanced: raw JSON editor</summary>
          <form action={createHumorFlavorAction} className="mt-3 grid gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Create flavor payload (JSON)</span>
              <textarea
                name="payload"
                rows={6}
                defaultValue={defaultFlavorPayload}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
            <PendingSubmitButton
              idleLabel="Create Flavor (JSON)"
              pendingLabel="Creating Flavor..."
              className="w-fit rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </form>
        </details>

        {selectedFlavor && (
          <article className="mt-5 rounded-xl border border-cyan-400/40 bg-cyan-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Selected Flavor</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{selectedFlavorName}</p>
            <p className="mt-1 text-xs text-slate-300" title={selectedFlavorId}>
              id: {selectedFlavorId}
            </p>

            <section className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
              <p className="text-xs text-cyan-100">Quick Update</p>
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
              <summary className="cursor-pointer text-xs font-semibold text-slate-200">Advanced: edit full flavor row JSON</summary>
              <form action={updateHumorFlavorAction} className="mt-2 grid gap-2">
                <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                <input type="hidden" name="id_column" value={flavorIdColumn} />
                <label className="grid gap-1 text-xs text-slate-300">
                  Update selected flavor (JSON)
                  <textarea
                    name="payload"
                    rows={8}
                    defaultValue={stringifyJson(selectedFlavor)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </label>
                <PendingSubmitButton
                  idleLabel="Update Flavor (JSON)"
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

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Humor Flavor Steps</p>
        <h3 className="mt-1 text-xl font-semibold">Step CRUD + Reordering</h3>

        {selectedFlavor ? (
          <>
            <p className="mt-1 text-sm text-slate-300">
              Selected flavor: <span className="font-semibold text-slate-100">{selectedFlavorName}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Step table: {stepTableResolution.tableName ?? HUMOR_FLAVOR_STEP_TABLE_CANDIDATES[0]} | id column: {stepIdColumn} |
              flavor column: {stepFlavorColumn} | order column: {stepOrderColumn} | step text column: {stepPromptColumn ?? 'not detected'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              LLM columns: model={stepModelColumn ?? 'n/a'} | input={stepInputTypeColumn ?? 'n/a'} | output={stepOutputTypeColumn ?? 'n/a'} | stepType={stepTypeColumn ?? 'n/a'} | temp={stepTemperatureColumn ?? 'n/a'}
            </p>

            <section className="mt-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Guided Step Builder</p>
              <h4 className="mt-1 text-base font-semibold text-slate-100">Only Change Specific Words</h4>
              <p className="mt-1 text-xs text-slate-300">
                Use this form if you want the format provided automatically. You only edit a few words and the step JSON is generated.
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
                  Could not detect the step prompt column for this table, so guided creation is unavailable. Use the raw JSON editor below.
                </p>
              )}
            </section>

            <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">Advanced: raw JSON editor</summary>
              <form action={createHumorFlavorStepAction} className="mt-3 grid gap-2">
                <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                <input type="hidden" name="flavor_column" value={stepFlavorColumn} />
                <input type="hidden" name="order_column" value={stepOrderColumn} />
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">Create step payload (JSON)</span>
                  <textarea
                    name="payload"
                    rows={6}
                    defaultValue={defaultStepPayload}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </label>
                <PendingSubmitButton
                  idleLabel="Create Step (JSON)"
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
                          step_id: {stepId || 'n/a'} | current order: {orderLabel}
                        </p>
                        <p className="mt-1 text-sm text-slate-200">{(stepPromptColumn ? asCleanString(row[stepPromptColumn]) : '') || pickStepPrompt(row) || '(no prompt text)'}</p>
                      </div>
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
                            Move Up
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
                            Move Down
                          </button>
                        </form>
                        <form action={moveHumorFlavorStepAction} className="flex items-center gap-1">
                          <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                          <input type="hidden" name="step_id" value={stepId} />
                          <input type="hidden" name="id_column" value={stepIdColumn} />
                          <input type="hidden" name="flavor_column" value={stepFlavorColumn} />
                          <input type="hidden" name="order_column" value={stepOrderColumn} />
                          <input
                            type="number"
                            name="target_position"
                            min={1}
                            defaultValue={index + 1}
                            className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                          />
                          <button
                            type="submit"
                            className="admin-neutral-btn rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-500"
                          >
                            Move To
                          </button>
                        </form>
                      </div>
                    </div>

                    {stepPromptColumn && (
                      <form action={replaceHumorFlavorStepPromptWordAction} className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                        <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                        <input type="hidden" name="step_id" value={stepId} />
                        <input type="hidden" name="id_column" value={stepIdColumn} />
                        <input type="hidden" name="prompt_column" value={stepPromptColumn} />
                        <p className="text-xs text-slate-300">Quick edit: replace one specific word in this step prompt.</p>
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
                    )}

                    <form action={updateHumorFlavorStepAction} className="mt-3 grid gap-2">
                      <input type="hidden" name="flavor_id" value={selectedFlavorId} />
                      <input type="hidden" name="step_id" value={stepId} />
                      <input type="hidden" name="id_column" value={stepIdColumn} />
                      <label className="grid gap-1 text-xs text-slate-300">
                        Update step row (JSON)
                        <textarea
                          name="payload"
                          rows={8}
                          defaultValue={stringifyJson(row)}
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

      {flavorOptions.length > 0 && testImages.length > 0 ? (
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
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Flavor Directory</p>
        <h3 className="mt-1 text-xl font-semibold">Pick Flavor To Manage</h3>
        <p className="mt-1 text-sm text-slate-300">Newest flavors are listed first.</p>

        <div className="mt-4 space-y-2">
          {flavorRows.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
              No flavor rows found.
            </div>
          )}

          {flavorRows.map((row) => {
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
                  href={`/admin/humor-flavors?flavor=${encodeURIComponent(flavorId)}`}
                  className={`mt-3 inline-flex w-full items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                      : 'border-slate-700 text-slate-200 hover:border-slate-500'
                  }`}
                >
                  {isSelected ? 'Selected Flavor' : 'Select Flavor'}
                </Link>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
