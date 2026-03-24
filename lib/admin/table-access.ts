import { SupabaseClient } from '@supabase/supabase-js'

import { AdminEntityDefinition } from '@/lib/admin/entities'

export type EntityRow = Record<string, unknown>

interface TableResolution {
  tableName: string | null
  errorMessage: string | null
}

export interface EntitySnapshot {
  entity: AdminEntityDefinition
  tableName: string | null
  rows: EntityRow[]
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

function normalizeErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Unknown error'
}

export async function resolveEntityTableName(
  supabase: SupabaseClient,
  entity: AdminEntityDefinition
): Promise<TableResolution> {
  for (const candidate of entity.tableCandidates) {
    const { error } = await supabase.from(candidate).select('*').limit(1)

    if (!error) {
      return { tableName: candidate, errorMessage: null }
    }

    if (relationMissing(error)) {
      continue
    }

    return {
      tableName: candidate,
      errorMessage: normalizeErrorMessage(error),
    }
  }

  return {
    tableName: null,
    errorMessage: `No table found. Tried: ${entity.tableCandidates.join(', ')}`,
  }
}

export async function loadEntitySnapshot(
  supabase: SupabaseClient,
  entity: AdminEntityDefinition
): Promise<EntitySnapshot> {
  const resolution = await resolveEntityTableName(supabase, entity)

  if (!resolution.tableName) {
    return {
      entity,
      tableName: null,
      rows: [],
      errorMessage: resolution.errorMessage,
    }
  }

  const { data, error } = await supabase
    .from(resolution.tableName)
    .select('*')
    .limit(entity.rowLimit ?? 100)

  if (error) {
    return {
      entity,
      tableName: resolution.tableName,
      rows: [],
      errorMessage: normalizeErrorMessage(error),
    }
  }

  return {
    entity,
    tableName: resolution.tableName,
    rows: (data ?? []) as EntityRow[],
    errorMessage: resolution.errorMessage,
  }
}

export function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function parseJsonObject(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('JSON payload is required.')
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('Payload must be valid JSON.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payload must be a JSON object.')
  }

  return parsed as Record<string, unknown>
}

export function parseMatchValue(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Match value is required.')
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

export function pickRowIdentifier(row: EntityRow) {
  const priorityKeys = ['id', 'uuid', 'slug', 'email', 'domain', 'name']

  for (const key of priorityKeys) {
    if (!(key in row)) continue
    const value = row[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return { column: key, value }
    }
  }

  for (const [column, value] of Object.entries(row)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return { column, value }
    }
  }

  return null
}
