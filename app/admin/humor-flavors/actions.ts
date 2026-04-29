'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  FLAVOR_NAME_COLUMN_CANDIDATES,
  HUMOR_FLAVOR_STEP_TABLE_CANDIDATES,
  HUMOR_FLAVOR_TABLE_CANDIDATES,
  STEP_INPUT_TYPE_COLUMN_CANDIDATES,
  STEP_MODEL_COLUMN_CANDIDATES,
  STEP_OUTPUT_TYPE_COLUMN_CANDIDATES,
  STEP_FLAVOR_COLUMN_CANDIDATES,
  STEP_ORDER_COLUMN_CANDIDATES,
  STEP_TEMPERATURE_COLUMN_CANDIDATES,
  STEP_TYPE_COLUMN_CANDIDATES,
  asCleanString,
  parseJsonObjectOrThrow,
  pickFirstExistingColumn,
  pickStepOrderValue,
  resolveFirstExistingColumn,
  resolveFirstExistingTable,
  sortStepsByOrder,
} from '@/lib/admin/humor-flavors'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

type ActionStatus = 'success' | 'error'
const DEFAULT_GUIDED_STEP_TEMPLATE =
  'Describe [SUBJECT] in neutral language, then write one [TONE] caption focused on [FOCUS]. Keep it under [MAX_WORDS] words.'

function isRedirectException(error: unknown) {
  if (!error || typeof error !== 'object') return false
  if (!('digest' in error)) return false
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}

function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function replaceTemplateToken(template: string, token: string, replacement: string) {
  return template.split(`[${token}]`).join(replacement)
}

function buildGuidedStepPayload(formData: FormData) {
  const promptColumn = normalizeText(formData.get('prompt_column'))
  if (!promptColumn) {
    throw new Error('Step text column was not detected. Use the JSON payload editor for this table.')
  }

  const subject = normalizeText(formData.get('subject_word')) || 'the image'
  const focus = normalizeText(formData.get('focus_word')) || 'the funniest detail'
  const tone = normalizeText(formData.get('tone_word')) || 'playful'
  const maxWords = normalizeText(formData.get('max_words')) || '12'
  const template = normalizeText(formData.get('prompt_template')) || DEFAULT_GUIDED_STEP_TEMPLATE

  let promptText = template
  promptText = replaceTemplateToken(promptText, 'SUBJECT', subject)
  promptText = replaceTemplateToken(promptText, 'FOCUS', focus)
  promptText = replaceTemplateToken(promptText, 'TONE', tone)
  promptText = replaceTemplateToken(promptText, 'MAX_WORDS', maxWords)

  if (!promptText) {
    throw new Error('Generated prompt text is empty. Update the guided template fields and try again.')
  }

  return {
    [promptColumn]: promptText,
  } as Record<string, unknown>
}

function buildGuidedFlavorPayload(formData: FormData) {
  const flavorNameColumn = normalizeText(formData.get('flavor_name_column')) || 'slug'
  const flavorDescriptionColumn = normalizeText(formData.get('flavor_description_column')) || 'description'
  const flavorName = normalizeText(formData.get('flavor_name'))
  const flavorDescription = normalizeText(formData.get('flavor_description'))

  if (!flavorName) {
    throw new Error('Flavor name is required.')
  }

  const payload: Record<string, unknown> = {
    [flavorNameColumn]: flavorName,
  }

  if (flavorDescription) {
    payload[flavorDescriptionColumn] = flavorDescription
  }

  return payload
}

function getMessagePath(status: ActionStatus, message: string, flavorId?: string) {
  const flavorSegment = flavorId ? `&flavor=${encodeURIComponent(flavorId)}` : ''
  return `/admin/humor-flavors?status=${status}&message=${encodeURIComponent(message)}${flavorSegment}`
}

function parseMaybeJson(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

interface SupabaseLikeError {
  message: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

function formatSupabaseActionError(error: SupabaseLikeError) {
  const message = error.message || 'Database operation failed.'
  const details = typeof error.details === 'string' && error.details.trim() ? error.details.trim() : ''
  const hint = typeof error.hint === 'string' && error.hint.trim() ? error.hint.trim() : ''

  if (error.code === '23503' && /humor_flavor_steps_humor_flavor_id_fkey/i.test(message)) {
    const suffix = details ? ` Details: ${details}` : ''
    return `Invalid humor flavor id. The selected "humor_flavor_id" does not exist in humor_flavors.${suffix}`
  }

  const extras = [details && `Details: ${details}`, hint && `Hint: ${hint}`].filter(Boolean).join(' ')
  return extras ? `${message} ${extras}` : message
}

function withCreateAuditFields(payload: Record<string, unknown>, userId: string) {
  return {
    ...payload,
    created_by_user_id: userId,
    modified_by_user_id: userId,
  }
}

function withUpdateAuditFields(payload: Record<string, unknown>, userId: string) {
  return {
    ...payload,
    modified_by_user_id: userId,
  }
}

function buildUniqueName(baseName: string, takenNames: Set<string>) {
  const cleanedBase = baseName.trim() || 'Humor Flavor Copy'
  let candidate = cleanedBase
  let counter = 2

  while (takenNames.has(candidate.toLowerCase())) {
    candidate = `${cleanedBase} ${counter}`
    counter += 1
  }

  return candidate
}

async function resolveFlavorTableOrThrow() {
  const { supabase, user } = await requireSuperadminOrMatrixAdmin()
  const resolution = await resolveFirstExistingTable(supabase, HUMOR_FLAVOR_TABLE_CANDIDATES)

  if (!resolution.tableName) {
    throw new Error(resolution.errorMessage ?? 'Unable to find humor flavor table.')
  }

  return { supabase, user, tableName: resolution.tableName }
}

async function resolveStepTableOrThrow() {
  const { supabase, user } = await requireSuperadminOrMatrixAdmin()
  const resolution = await resolveFirstExistingTable(supabase, HUMOR_FLAVOR_STEP_TABLE_CANDIDATES)

  if (!resolution.tableName) {
    throw new Error(resolution.errorMessage ?? 'Unable to find humor flavor steps table.')
  }

  return { supabase, user, tableName: resolution.tableName }
}

function revalidateAdminRoutes() {
  revalidatePath('/admin')
  revalidatePath('/admin/operations')
  revalidatePath('/admin/humor-flavors')
  revalidatePath('/admin/captions')
}

export async function createHumorFlavorAction(formData: FormData) {
  try {
    const rawPayload = normalizeText(formData.get('payload'))
    const payload = rawPayload ? parseJsonObjectOrThrow(rawPayload) : buildGuidedFlavorPayload(formData)
    const { supabase, user, tableName } = await resolveFlavorTableOrThrow()

    const { data, error } = await supabase
      .from(tableName)
      .insert(withCreateAuditFields(payload, user.id))
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    const flavorId = asCleanString(data?.id ?? payload.id)
    revalidateAdminRoutes()
    redirect(getMessagePath('success', 'Humor flavor created.', flavorId))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to create humor flavor.'
    redirect(getMessagePath('error', message))
  }
}

export async function updateHumorFlavorAction(formData: FormData) {
  const flavorId = normalizeText(formData.get('flavor_id'))
  const idColumn = normalizeText(formData.get('id_column')) || 'id'

  try {
    if (!flavorId) {
      throw new Error('Flavor id is required.')
    }

    const rawPayload = normalizeText(formData.get('payload'))
    const payload = rawPayload ? parseJsonObjectOrThrow(rawPayload) : buildGuidedFlavorPayload(formData)
    const { supabase, user, tableName } = await resolveFlavorTableOrThrow()

    const { error } = await supabase
      .from(tableName)
      .update(withUpdateAuditFields(payload, user.id))
      .eq(idColumn, parseMaybeJson(flavorId))

    if (error) {
      throw new Error(error.message)
    }

    revalidateAdminRoutes()
    redirect(getMessagePath('success', 'Humor flavor updated.', flavorId))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to update humor flavor.'
    redirect(getMessagePath('error', message, flavorId))
  }
}

export async function deleteHumorFlavorAction(formData: FormData) {
  const flavorId = normalizeText(formData.get('flavor_id'))
  const idColumn = normalizeText(formData.get('id_column')) || 'id'

  try {
    if (!flavorId) {
      throw new Error('Flavor id is required.')
    }

    const { supabase, tableName } = await resolveFlavorTableOrThrow()
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(idColumn, parseMaybeJson(flavorId))

    if (error) {
      throw new Error(error.message)
    }

    revalidateAdminRoutes()
    redirect(getMessagePath('success', 'Humor flavor deleted.'))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to delete humor flavor.'
    redirect(getMessagePath('error', message, flavorId))
  }
}

export async function duplicateHumorFlavorAction(formData: FormData) {
  const sourceFlavorId = normalizeText(formData.get('source_flavor_id'))
  const sourceIdColumn = normalizeText(formData.get('source_id_column')) || 'id'
  const requestedName = normalizeText(formData.get('new_flavor_name'))

  try {
    if (!sourceFlavorId) {
      throw new Error('Source flavor id is required.')
    }

    const { supabase, user } = await requireSuperadminOrMatrixAdmin()
    const flavorResolution = await resolveFirstExistingTable(supabase, HUMOR_FLAVOR_TABLE_CANDIDATES)
    const stepResolution = await resolveFirstExistingTable(supabase, HUMOR_FLAVOR_STEP_TABLE_CANDIDATES)

    if (!flavorResolution.tableName) {
      throw new Error(flavorResolution.errorMessage ?? 'Unable to find humor flavor table.')
    }
    if (!stepResolution.tableName) {
      throw new Error(stepResolution.errorMessage ?? 'Unable to find humor flavor steps table.')
    }

    const flavorTableName = flavorResolution.tableName
    const stepTableName = stepResolution.tableName

    const flavorRowsResult = await supabase.from(flavorTableName).select('*').limit(2000)
    if (flavorRowsResult.error) {
      throw new Error(flavorRowsResult.error.message)
    }

    const flavorRows = (flavorRowsResult.data ?? []) as Record<string, unknown>[]
    const sourceFlavor = flavorRows.find((row) => asCleanString(row[sourceIdColumn]) === sourceFlavorId)
      ?? flavorRows.find((row) => asCleanString(row.id) === sourceFlavorId)

    if (!sourceFlavor) {
      throw new Error('Could not find the source flavor row to duplicate.')
    }

    const flavorNameColumn = pickFirstExistingColumn(flavorRows, FLAVOR_NAME_COLUMN_CANDIDATES)
      ?? (await resolveFirstExistingColumn(supabase, flavorTableName, FLAVOR_NAME_COLUMN_CANDIDATES))
      ?? Object.entries(sourceFlavor).find(([key, value]) => key !== sourceIdColumn && key !== 'id' && typeof value === 'string')?.[0]
      ?? 'slug'
    const sourceFlavorName = asCleanString(sourceFlavor[flavorNameColumn]) || asCleanString(sourceFlavor.id) || 'Humor Flavor'
    const takenNames = new Set(
      flavorRows
        .map((row) => asCleanString(row[flavorNameColumn]).toLowerCase())
        .filter(Boolean)
    )
    const desiredName = requestedName || `${sourceFlavorName} Copy`
    const uniqueName = buildUniqueName(desiredName, takenNames)

    const flavorPayload = { ...sourceFlavor }
    const flavorDropColumns = [
      sourceIdColumn,
      'id',
      'created_datetime_utc',
      'created_at',
      'updated_at',
      'modified_at',
      'modified_datetime_utc',
      'created_by_user_id',
      'modified_by_user_id',
    ]
    for (const column of flavorDropColumns) {
      delete flavorPayload[column]
    }
    flavorPayload[flavorNameColumn] = uniqueName

    const createFlavorResult = await supabase
      .from(flavorTableName)
      .insert(withCreateAuditFields(flavorPayload, user.id))
      .select('*')
      .limit(1)
      .maybeSingle()

    if (createFlavorResult.error || !createFlavorResult.data) {
      throw new Error(createFlavorResult.error?.message ?? 'Failed to create duplicated flavor.')
    }

    const newFlavorId = asCleanString(createFlavorResult.data[sourceIdColumn] ?? createFlavorResult.data.id)
    if (!newFlavorId) {
      throw new Error('Created duplicated flavor, but could not determine its id for step duplication.')
    }

    const stepFlavorColumn = (await resolveFirstExistingColumn(supabase, stepTableName, STEP_FLAVOR_COLUMN_CANDIDATES))
      ?? 'humor_flavor_id'
    const stepOrderColumn = (await resolveFirstExistingColumn(supabase, stepTableName, STEP_ORDER_COLUMN_CANDIDATES))
      ?? 'step_order'

    const sourceStepsResult = await supabase
      .from(stepTableName)
      .select('*')
      .eq(stepFlavorColumn, parseMaybeJson(sourceFlavorId))
      .limit(2000)

    if (sourceStepsResult.error) {
      throw new Error(sourceStepsResult.error.message)
    }

    let sourceStepRows = (sourceStepsResult.data ?? []) as Record<string, unknown>[]
    if (sourceStepRows.length === 0 && sourceFlavorName && sourceFlavorName !== sourceFlavorId) {
      const sourceStepsByNameResult = await supabase
        .from(stepTableName)
        .select('*')
        .eq(stepFlavorColumn, sourceFlavorName)
        .limit(2000)

      if (sourceStepsByNameResult.error) {
        throw new Error(sourceStepsByNameResult.error.message)
      }
      sourceStepRows = (sourceStepsByNameResult.data ?? []) as Record<string, unknown>[]
    }

    const sourceSteps = sortStepsByOrder(sourceStepRows, stepOrderColumn)
    const stepIdColumn = pickFirstExistingColumn(sourceSteps, ['id', 'uuid']) ?? 'id'
    const duplicatedFlavorReference = (() => {
      const sampleValue = sourceSteps[0]?.[stepFlavorColumn]
      if (typeof sampleValue === 'string' && sampleValue.trim() === sourceFlavorName) {
        return uniqueName
      }
      return parseMaybeJson(newFlavorId)
    })()

    const duplicatedStepsPayload = sourceSteps.map((step, index) => {
      const nextStep = { ...step }
      const stepDropColumns = [
        stepIdColumn,
        'id',
        'created_datetime_utc',
        'created_at',
        'updated_at',
        'modified_at',
        'modified_datetime_utc',
        'created_by_user_id',
        'modified_by_user_id',
      ]
      for (const column of stepDropColumns) {
        delete nextStep[column]
      }
      nextStep[stepFlavorColumn] = duplicatedFlavorReference
      nextStep[stepOrderColumn] = index + 1
      return withCreateAuditFields(nextStep, user.id)
    })

    if (duplicatedStepsPayload.length > 0) {
      const insertStepsResult = await supabase.from(stepTableName).insert(duplicatedStepsPayload)
      if (insertStepsResult.error) {
        throw new Error(insertStepsResult.error.message)
      }
    }

    revalidateAdminRoutes()
    const label = duplicatedStepsPayload.length === 1 ? 'step' : 'steps'
    redirect(
      getMessagePath(
        'success',
        `Duplicated "${sourceFlavorName}" as "${uniqueName}" with ${duplicatedStepsPayload.length} ${label}.`,
        newFlavorId
      )
    )
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to duplicate humor flavor.'
    redirect(getMessagePath('error', message, sourceFlavorId))
  }
}

async function resolveDefaultStepColumns(
  supabase: Awaited<ReturnType<typeof requireSuperadminOrMatrixAdmin>>['supabase'],
  tableName: string,
  flavorId?: string
) {
  const { data, error } = await supabase.from(tableName).select('*').limit(500)
  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const flavorColumn = STEP_FLAVOR_COLUMN_CANDIDATES.find((candidate) => rows.some((row) => candidate in row))
    ?? (await resolveFirstExistingColumn(supabase, tableName, STEP_FLAVOR_COLUMN_CANDIDATES))
    ?? 'humor_flavor_id'
  const orderColumn = STEP_ORDER_COLUMN_CANDIDATES.find((candidate) => rows.some((row) => candidate in row))
    ?? (await resolveFirstExistingColumn(supabase, tableName, STEP_ORDER_COLUMN_CANDIDATES))
    ?? 'step_order'

  const modelColumn = STEP_MODEL_COLUMN_CANDIDATES.find((candidate) => rows.some((row) => candidate in row))
    ?? (await resolveFirstExistingColumn(supabase, tableName, STEP_MODEL_COLUMN_CANDIDATES))
  const inputTypeColumn = STEP_INPUT_TYPE_COLUMN_CANDIDATES.find((candidate) => rows.some((row) => candidate in row))
    ?? (await resolveFirstExistingColumn(supabase, tableName, STEP_INPUT_TYPE_COLUMN_CANDIDATES))
  const outputTypeColumn = STEP_OUTPUT_TYPE_COLUMN_CANDIDATES.find((candidate) => rows.some((row) => candidate in row))
    ?? (await resolveFirstExistingColumn(supabase, tableName, STEP_OUTPUT_TYPE_COLUMN_CANDIDATES))
  const stepTypeColumn = STEP_TYPE_COLUMN_CANDIDATES.find((candidate) => rows.some((row) => candidate in row))
    ?? (await resolveFirstExistingColumn(supabase, tableName, STEP_TYPE_COLUMN_CANDIDATES))
  const temperatureColumn = STEP_TEMPERATURE_COLUMN_CANDIDATES.find((candidate) => rows.some((row) => candidate in row))
    ?? (await resolveFirstExistingColumn(supabase, tableName, STEP_TEMPERATURE_COLUMN_CANDIDATES))

  const parsedFlavorId = flavorId ? parseMaybeJson(flavorId) : null
  const templateRow = parsedFlavorId === null
    ? (rows[0] ?? null)
    : (rows.find((row) => row[flavorColumn] === parsedFlavorId) ?? rows[0] ?? null)

  return {
    flavorColumn,
    orderColumn,
    modelColumn,
    inputTypeColumn,
    outputTypeColumn,
    stepTypeColumn,
    temperatureColumn,
    templateRow,
  }
}

async function getNextStepOrder(
  supabase: Awaited<ReturnType<typeof requireSuperadminOrMatrixAdmin>>['supabase'],
  tableName: string,
  flavorColumn: string,
  flavorId: string,
  orderColumn: string
) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq(flavorColumn, parseMaybeJson(flavorId))
    .limit(500)

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  let maxOrder = 0
  for (const row of rows) {
    const orderValue = pickStepOrderValue(row, orderColumn)
    if (Number.isFinite(orderValue) && orderValue > maxOrder && orderValue < Number.MAX_SAFE_INTEGER) {
      maxOrder = orderValue
    }
  }

  return maxOrder + 1
}

async function resolveFirstTableId(
  supabase: Awaited<ReturnType<typeof requireSuperadminOrMatrixAdmin>>['supabase'],
  tableCandidates: string[]
) {
  for (const tableName of tableCandidates) {
    const { data, error } = await supabase.from(tableName).select('id').limit(1)
    if (error) {
      if (/relation .* does not exist|table .* does not exist|could not find the table/i.test(error.message)) {
        continue
      }
      continue
    }

    const firstRow = (data ?? [])[0] as Record<string, unknown> | undefined
    if (!firstRow) continue
    if (firstRow.id !== undefined && firstRow.id !== null && firstRow.id !== '') {
      return firstRow.id
    }
  }

  return null
}

export async function createHumorFlavorStepAction(formData: FormData) {
  const flavorId = normalizeText(formData.get('flavor_id'))
  const suppliedFlavorColumn = normalizeText(formData.get('flavor_column'))
  const suppliedOrderColumn = normalizeText(formData.get('order_column'))

  try {
    const rawPayload = normalizeText(formData.get('payload'))
    const payload = rawPayload ? parseJsonObjectOrThrow(rawPayload) : buildGuidedStepPayload(formData)
    const { supabase, user, tableName } = await resolveStepTableOrThrow()
    const defaults = await resolveDefaultStepColumns(supabase, tableName, flavorId || undefined)
    const flavorColumn = suppliedFlavorColumn || defaults.flavorColumn
    const orderColumn = suppliedOrderColumn || defaults.orderColumn

    if (flavorId && !(flavorColumn in payload)) {
      payload[flavorColumn] = parseMaybeJson(flavorId)
    }

    if (flavorId && !(orderColumn in payload)) {
      payload[orderColumn] = await getNextStepOrder(supabase, tableName, flavorColumn, flavorId, orderColumn)
    }

    const fillFromTemplate = (columnName: string | null | undefined) => {
      if (!columnName) return
      if (columnName in payload) return
      const templateValue = defaults.templateRow?.[columnName]
      if (templateValue !== undefined && templateValue !== null && templateValue !== '') {
        payload[columnName] = templateValue
      }
    }

    fillFromTemplate(defaults.modelColumn)
    fillFromTemplate(defaults.inputTypeColumn)
    fillFromTemplate(defaults.outputTypeColumn)
    fillFromTemplate(defaults.stepTypeColumn)
    fillFromTemplate(defaults.temperatureColumn)

    const fillWithLookupFallback = async (columnName: string | null | undefined, tableCandidates: string[]) => {
      if (!columnName) return
      if (columnName in payload) return

      const fallbackId = await resolveFirstTableId(supabase, tableCandidates)
      if (fallbackId !== null) {
        payload[columnName] = fallbackId
      }
    }

    await fillWithLookupFallback(defaults.modelColumn, ['llm_models', 'llm_model'])
    await fillWithLookupFallback(defaults.inputTypeColumn, ['llm_input_types', 'llm_input_type'])
    await fillWithLookupFallback(defaults.outputTypeColumn, ['llm_output_types', 'llm_output_type'])
    await fillWithLookupFallback(defaults.stepTypeColumn, ['humor_flavor_step_types', 'humor_flavor_step_type'])

    const { error } = await supabase
      .from(tableName)
      .insert(withCreateAuditFields(payload, user.id))

    if (error) {
      const nullColumnMatch = error.message.match(/null value in column \"([^\"]+)\"/i)
      if (nullColumnMatch) {
        throw new Error(
          `${error.message}. Add "${nullColumnMatch[1]}" to your step payload, or create one complete step first so defaults can be reused.`
        )
      }
      throw new Error(formatSupabaseActionError(error))
    }

    revalidateAdminRoutes()
    const redirectFlavorId = flavorId || asCleanString(payload[flavorColumn])
    redirect(getMessagePath('success', 'Humor flavor step created.', redirectFlavorId))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to create humor flavor step.'
    redirect(getMessagePath('error', message, flavorId))
  }
}

export async function replaceHumorFlavorStepPromptWordAction(formData: FormData) {
  const flavorId = normalizeText(formData.get('flavor_id'))
  const stepId = normalizeText(formData.get('step_id'))
  const idColumn = normalizeText(formData.get('id_column')) || 'id'
  const promptColumn = normalizeText(formData.get('prompt_column'))
  const fromWord = normalizeText(formData.get('from_word'))
  const toWord = normalizeText(formData.get('to_word'))

  try {
    if (!stepId) {
      throw new Error('Step id is required.')
    }
    if (!promptColumn) {
      throw new Error('Prompt column is required for quick word replace.')
    }
    if (!fromWord || !toWord) {
      throw new Error('Both "from" and "to" words are required.')
    }

    const { supabase, user, tableName } = await resolveStepTableOrThrow()
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq(idColumn, parseMaybeJson(stepId))
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(formatSupabaseActionError(error))
    }

    const row = (data ?? null) as Record<string, unknown> | null
    const currentPrompt = asCleanString(row?.[promptColumn])
    if (!currentPrompt) {
      throw new Error('Current step prompt text is empty or unavailable.')
    }

    const updatedPrompt = currentPrompt.split(fromWord).join(toWord)
    if (updatedPrompt === currentPrompt) {
      throw new Error(`No matches found for "${fromWord}" in this step prompt.`)
    }

    const { error: updateError } = await supabase
      .from(tableName)
      .update(withUpdateAuditFields({ [promptColumn]: updatedPrompt }, user.id))
      .eq(idColumn, parseMaybeJson(stepId))

    if (updateError) {
      throw new Error(formatSupabaseActionError(updateError))
    }

    revalidateAdminRoutes()
    redirect(getMessagePath('success', 'Step prompt word replacement applied.', flavorId))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to replace word in step prompt.'
    redirect(getMessagePath('error', message, flavorId))
  }
}

export async function updateHumorFlavorStepAction(formData: FormData) {
  const flavorId = normalizeText(formData.get('flavor_id'))
  const stepId = normalizeText(formData.get('step_id'))
  const idColumn = normalizeText(formData.get('id_column')) || 'id'

  try {
    if (!stepId) {
      throw new Error('Step id is required.')
    }

    const payload = parseJsonObjectOrThrow(normalizeText(formData.get('payload')))
    const { supabase, user, tableName } = await resolveStepTableOrThrow()

    const { error } = await supabase
      .from(tableName)
      .update(withUpdateAuditFields(payload, user.id))
      .eq(idColumn, parseMaybeJson(stepId))

    if (error) {
      throw new Error(formatSupabaseActionError(error))
    }

    revalidateAdminRoutes()
    redirect(getMessagePath('success', 'Humor flavor step updated.', flavorId))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to update humor flavor step.'
    redirect(getMessagePath('error', message, flavorId))
  }
}

export async function deleteHumorFlavorStepAction(formData: FormData) {
  const flavorId = normalizeText(formData.get('flavor_id'))
  const stepId = normalizeText(formData.get('step_id'))
  const idColumn = normalizeText(formData.get('id_column')) || 'id'

  try {
    if (!stepId) {
      throw new Error('Step id is required.')
    }

    const { supabase, tableName } = await resolveStepTableOrThrow()

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(idColumn, parseMaybeJson(stepId))

    if (error) {
      throw new Error(error.message)
    }

    revalidateAdminRoutes()
    redirect(getMessagePath('success', 'Humor flavor step deleted.', flavorId))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to delete humor flavor step.'
    redirect(getMessagePath('error', message, flavorId))
  }
}

export async function moveHumorFlavorStepAction(formData: FormData) {
  const flavorId = normalizeText(formData.get('flavor_id'))
  const stepId = normalizeText(formData.get('step_id'))
  const direction = normalizeText(formData.get('direction'))
  const targetPositionRaw = normalizeText(formData.get('target_position'))
  const idColumn = normalizeText(formData.get('id_column')) || 'id'
  const flavorColumn = normalizeText(formData.get('flavor_column')) || 'humor_flavor_id'
  const orderColumn = normalizeText(formData.get('order_column')) || 'step_order'

  try {
    if (!flavorId) {
      throw new Error('Flavor id is required.')
    }

    if (!stepId) {
      throw new Error('Step id is required.')
    }

    const { supabase, user, tableName } = await resolveStepTableOrThrow()
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq(flavorColumn, parseMaybeJson(flavorId))
      .limit(1000)

    if (error) {
      throw new Error(error.message)
    }

    const rows = sortStepsByOrder((data ?? []) as Record<string, unknown>[], orderColumn)
    const currentIndex = rows.findIndex((row) => asCleanString(row[idColumn]) === stepId)

    if (currentIndex < 0) {
      throw new Error('Step was not found in current flavor steps.')
    }

    let nextIndex = currentIndex
    if (direction === 'up') {
      nextIndex = Math.max(0, currentIndex - 1)
    } else if (direction === 'down') {
      nextIndex = Math.min(rows.length - 1, currentIndex + 1)
    } else if (targetPositionRaw) {
      const parsedTarget = Number.parseInt(targetPositionRaw, 10)
      if (Number.isNaN(parsedTarget)) {
        throw new Error('Target position must be a number.')
      }
      nextIndex = Math.min(Math.max(parsedTarget - 1, 0), rows.length - 1)
    }

    if (nextIndex === currentIndex) {
      redirect(getMessagePath('success', 'Step order unchanged.', flavorId))
    }

    const reordered = [...rows]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(nextIndex, 0, moved)

    const updates = reordered
      .map((row, index) => ({
        idValue: row[idColumn],
        nextOrder: index + 1,
        currentOrder: pickStepOrderValue(row, orderColumn),
      }))
      .filter((item) => item.idValue !== undefined)
      .filter((item) => item.currentOrder !== item.nextOrder)

    for (const item of updates) {
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          [orderColumn]: item.nextOrder,
          modified_by_user_id: user.id,
        })
        .eq(idColumn, item.idValue)

      if (updateError) {
        throw new Error(updateError.message)
      }
    }

    revalidateAdminRoutes()
    redirect(getMessagePath('success', 'Step order updated.', flavorId))
  } catch (error) {
    if (isRedirectException(error)) throw error
    const message = error instanceof Error ? error.message : 'Failed to reorder flavor steps.'
    redirect(getMessagePath('error', message, flavorId))
  }
}
