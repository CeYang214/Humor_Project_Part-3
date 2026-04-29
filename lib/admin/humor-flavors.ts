import { SupabaseClient } from '@supabase/supabase-js'
import { parsePayloadInput, stringifyPayloadInput } from '@/lib/admin/payload-input'

export type DataRow = Record<string, unknown>

export const HUMOR_FLAVOR_TABLE_CANDIDATES = ['humor_flavors', 'humor_flavor']
export const HUMOR_FLAVOR_STEP_TABLE_CANDIDATES = ['humor_flavor_steps', 'humor_flavor_step']

export const FLAVOR_NAME_COLUMN_CANDIDATES = ['slug', 'name', 'label', 'title', 'flavor_name', 'humor_flavor']
export const FLAVOR_DESCRIPTION_COLUMN_CANDIDATES = ['description', 'details', 'prompt', 'notes']
export const STEP_ORDER_COLUMN_CANDIDATES = ['order_by', 'step_order', 'step_number', 'order_index', 'position', 'sequence', 'step_index']
export const STEP_FLAVOR_COLUMN_CANDIDATES = ['humor_flavor_id', 'humor_flavor', 'flavor_id', 'flavor', 'chain_id', 'prompt_chain_id']
export const STEP_PROMPT_COLUMN_CANDIDATES = ['llm_user_prompt', 'llm_system_prompt', 'description', 'prompt', 'step_prompt', 'instruction', 'text', 'content', 'template']
export const STEP_MODEL_COLUMN_CANDIDATES = ['llm_model_id']
export const STEP_INPUT_TYPE_COLUMN_CANDIDATES = ['llm_input_type_id']
export const STEP_OUTPUT_TYPE_COLUMN_CANDIDATES = ['llm_output_type_id']
export const STEP_TYPE_COLUMN_CANDIDATES = ['humor_flavor_step_type_id', 'step_type_id']
export const STEP_TEMPERATURE_COLUMN_CANDIDATES = ['llm_temperature', 'temperature']
export const CAPTION_FLAVOR_COLUMN_CANDIDATES = ['humor_flavor_id', 'humor_flavor', 'flavor_id', 'flavor', 'prompt_chain']

interface TableResolution {
  tableName: string | null
  errorMessage: string | null
}

function relationMissing(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const code = 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? ((error as { code: string }).code)
    : ''
  if (code === '42P01') return true

  const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
    ? ((error as { message: string }).message)
    : ''

  return /relation .* does not exist|table .* does not exist|could not find the table/i.test(message)
}

function columnMissing(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const code = 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? ((error as { code: string }).code)
    : ''
  if (code === '42703') return true

  const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
    ? ((error as { message: string }).message)
    : ''

  return /column .* does not exist|could not find the column/i.test(message)
}

function normalizeErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Unknown error'
}

export async function resolveFirstExistingTable(
  supabase: SupabaseClient,
  tableCandidates: string[]
): Promise<TableResolution> {
  for (const tableName of tableCandidates) {
    const { error } = await supabase.from(tableName).select('*').limit(1)

    if (!error) {
      return { tableName, errorMessage: null }
    }

    if (relationMissing(error)) {
      continue
    }

    return {
      tableName,
      errorMessage: normalizeErrorMessage(error),
    }
  }

  return {
    tableName: null,
    errorMessage: `No table found. Tried: ${tableCandidates.join(', ')}`,
  }
}

export async function resolveFirstExistingColumn(
  supabase: SupabaseClient,
  tableName: string,
  columnCandidates: string[]
) {
  for (const columnName of columnCandidates) {
    const { error } = await supabase.from(tableName).select(columnName).limit(1)

    if (!error) {
      return columnName
    }

    if (columnMissing(error)) {
      continue
    }

    if (relationMissing(error)) {
      return null
    }
  }

  return null
}

export function asCleanString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

export function pickFirstExistingColumn(rows: DataRow[], candidates: string[]) {
  for (const candidate of candidates) {
    if (rows.some((row) => candidate in row)) {
      return candidate
    }
  }
  return null
}

export function pickIdentifierColumn(rows: DataRow[]) {
  const preferred = ['id', 'uuid', 'slug']
  const preferredColumn = pickFirstExistingColumn(rows, preferred)
  if (preferredColumn) return preferredColumn

  const firstRow = rows[0]
  if (!firstRow) return 'id'

  for (const [key, value] of Object.entries(firstRow)) {
    if (typeof value === 'string' || typeof value === 'number') {
      return key
    }
  }

  return 'id'
}

export function pickFlavorName(row: DataRow) {
  for (const key of FLAVOR_NAME_COLUMN_CANDIDATES) {
    const value = asCleanString(row[key])
    if (value) return value
  }
  return asCleanString(row.id) || 'Unnamed flavor'
}

export function pickFlavorDescription(row: DataRow) {
  for (const key of FLAVOR_DESCRIPTION_COLUMN_CANDIDATES) {
    const value = asCleanString(row[key])
    if (value) return value
  }
  return ''
}

export function pickStepPrompt(row: DataRow) {
  for (const key of STEP_PROMPT_COLUMN_CANDIDATES) {
    const value = asCleanString(row[key])
    if (value) return value
  }
  return ''
}

export function pickStepOrderValue(row: DataRow, orderColumn: string | null) {
  if (!orderColumn) return Number.MAX_SAFE_INTEGER
  const raw = row[orderColumn]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return Number.MAX_SAFE_INTEGER
}

export function sortStepsByOrder(rows: DataRow[], orderColumn: string | null) {
  return [...rows].sort((a, b) => {
    const aOrder = pickStepOrderValue(a, orderColumn)
    const bOrder = pickStepOrderValue(b, orderColumn)
    if (aOrder !== bOrder) return aOrder - bOrder
    return asCleanString(a.id).localeCompare(asCleanString(b.id))
  })
}

export function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function parseJsonObjectOrThrow(raw: string) {
  return parsePayloadInput(raw)
}

export function stringifyPayloadObject(value: DataRow) {
  return stringifyPayloadInput(value)
}
