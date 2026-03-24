'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  entitySupportsCreate,
  entitySupportsDelete,
  entitySupportsUpdate,
  getEntityDefinition,
} from '@/lib/admin/entities'
import { parseJsonObject, parseMatchValue, resolveEntityTableName } from '@/lib/admin/table-access'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ActionStatus = 'success' | 'error'
type AdminRedirectTarget = '/admin/operations'
type JsonObject = Record<string, unknown>

function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function getMessagePath(status: ActionStatus, message: string) {
  return `/admin/images?status=${status}&message=${encodeURIComponent(message)}`
}

function getOperationsMessagePath(status: ActionStatus, message: string, entityKey?: string) {
  const entityParam = entityKey ? `&entity=${encodeURIComponent(entityKey)}` : ''
  return `/admin/operations?status=${status}&message=${encodeURIComponent(message)}${entityParam}`
}

function normalizeRedirectTarget(value: FormDataEntryValue | null): AdminRedirectTarget {
  if (value === '/admin/operations') return '/admin/operations'
  return '/admin/operations'
}

function getEntityMessagePath(target: AdminRedirectTarget, status: ActionStatus, message: string, entityKey?: string) {
  return getOperationsMessagePath(status, message, entityKey)
}

function revalidateAdminRoutes() {
  revalidatePath('/admin')
  revalidatePath('/admin/images')
  revalidatePath('/admin/operations')
}

function assertEntity(entityKey: string) {
  const entity = getEntityDefinition(entityKey)
  if (!entity) {
    throw new Error(`Unknown entity key: ${entityKey}`)
  }
  return entity
}

async function resolveEntityTableOrThrow(entityKey: string) {
  const entity = assertEntity(entityKey)
  const { supabase, user } = await requireSuperadminOrMatrixAdmin()
  const resolution = await resolveEntityTableName(supabase, entity)

  if (!resolution.tableName) {
    throw new Error(resolution.errorMessage ?? `Unable to find table for entity ${entity.label}`)
  }

  return {
    supabase,
    user,
    entity,
    tableName: resolution.tableName,
  }
}

function withCreateAuditFields(payload: JsonObject, userId: string): JsonObject {
  return {
    ...payload,
    created_by_user_id: userId,
    modified_by_user_id: userId,
  }
}

function withUpdateAuditFields(payload: JsonObject, userId: string): JsonObject {
  return {
    ...payload,
    modified_by_user_id: userId,
  }
}

export async function signOutAdminAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function createEntityAction(formData: FormData) {
  const entityKey = normalizeText(formData.get('entity_key'))
  const redirectTarget = normalizeRedirectTarget(formData.get('redirect_to'))

  try {
    const payload = parseJsonObject(normalizeText(formData.get('payload')))
    const { supabase, user, entity, tableName } = await resolveEntityTableOrThrow(entityKey)

    if (!entitySupportsCreate(entity)) {
      redirect(getEntityMessagePath(redirectTarget, 'error', `${entity.label} is read-only.`, entityKey))
    }

    const { error } = await supabase.from(tableName).insert(withCreateAuditFields(payload, user.id))

    if (error) {
      throw new Error(error.message)
    }

    revalidateAdminRoutes()
    redirect(getEntityMessagePath(redirectTarget, 'success', `${entity.label}: row created.`, entityKey))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Create operation failed.'
    redirect(getEntityMessagePath(redirectTarget, 'error', message, entityKey))
  }
}

export async function updateEntityAction(formData: FormData) {
  const entityKey = normalizeText(formData.get('entity_key'))
  const redirectTarget = normalizeRedirectTarget(formData.get('redirect_to'))

  try {
    const payload = parseJsonObject(normalizeText(formData.get('payload')))
    const matchColumn = normalizeText(formData.get('match_column'))
    if (!matchColumn) {
      throw new Error('Match column is required for update.')
    }

    const matchValue = parseMatchValue(normalizeText(formData.get('match_value')))
    const { supabase, user, entity, tableName } = await resolveEntityTableOrThrow(entityKey)

    if (!entitySupportsUpdate(entity)) {
      redirect(getEntityMessagePath(redirectTarget, 'error', `${entity.label} does not allow updates.`, entityKey))
    }

    const { error } = await supabase
      .from(tableName)
      .update(withUpdateAuditFields(payload, user.id))
      .eq(matchColumn, matchValue)

    if (error) {
      throw new Error(error.message)
    }

    revalidateAdminRoutes()
    redirect(getEntityMessagePath(redirectTarget, 'success', `${entity.label}: row updated.`, entityKey))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update operation failed.'
    redirect(getEntityMessagePath(redirectTarget, 'error', message, entityKey))
  }
}

export async function deleteEntityAction(formData: FormData) {
  const entityKey = normalizeText(formData.get('entity_key'))
  const redirectTarget = normalizeRedirectTarget(formData.get('redirect_to'))

  try {
    const matchColumn = normalizeText(formData.get('match_column'))
    if (!matchColumn) {
      throw new Error('Match column is required for delete.')
    }

    const matchValue = parseMatchValue(normalizeText(formData.get('match_value')))
    const { supabase, entity, tableName } = await resolveEntityTableOrThrow(entityKey)

    if (!entitySupportsDelete(entity)) {
      redirect(getEntityMessagePath(redirectTarget, 'error', `${entity.label} does not allow deletes.`, entityKey))
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(matchColumn, matchValue)

    if (error) {
      throw new Error(error.message)
    }

    revalidateAdminRoutes()
    redirect(getEntityMessagePath(redirectTarget, 'success', `${entity.label}: row deleted.`, entityKey))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete operation failed.'
    redirect(getEntityMessagePath(redirectTarget, 'error', message, entityKey))
  }
}

export async function uploadImageAction(formData: FormData) {
  const entityKey = 'images'

  try {
    const { supabase, user, entity, tableName } = await (async () => {
      const { supabase, user } = await requireSuperadminOrMatrixAdmin()
      const entity = assertEntity(entityKey)
      const resolution = await resolveEntityTableName(supabase, entity)

      if (!resolution.tableName) {
        throw new Error(resolution.errorMessage ?? 'Unable to resolve images table.')
      }

      return { supabase, user, entity, tableName: resolution.tableName }
    })()

    if (!entitySupportsCreate(entity)) {
      redirect(getOperationsMessagePath('error', 'Images table is not configured for create operations.', entityKey))
    }

    const file = formData.get('file')
    const bucket = normalizeText(formData.get('bucket')) || 'images'
    const prefix = normalizeText(formData.get('prefix'))

    if (!(file instanceof File) || file.size === 0) {
      throw new Error('Choose a file before uploading.')
    }

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const folder = prefix ? `${prefix.replace(/^\/+|\/+$/g, '')}/` : ''
    const objectPath = `${folder}${Date.now()}-${crypto.randomUUID()}-${cleanName}`

    const { error: storageError } = await supabase.storage
      .from(bucket)
      .upload(objectPath, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })

    if (storageError) {
      throw new Error(
        `${storageError.message}. Ensure storage bucket '${bucket}' exists and your policies allow upload.`
      )
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectPath)
    const imageUrl = publicUrlData.publicUrl

    const { error: insertError } = await supabase
      .from(tableName)
      .insert({
        url: imageUrl,
        profile_id: user.id,
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      })

    if (insertError) {
      throw new Error(insertError.message)
    }

    revalidateAdminRoutes()
    redirect(getOperationsMessagePath('success', `Image uploaded to ${bucket}/${objectPath}`, entityKey))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image upload failed.'
    redirect(getOperationsMessagePath('error', message, entityKey))
  }
}

export async function createImageAction(formData: FormData) {
  const { supabase, user } = await requireSuperadminOrMatrixAdmin()
  const url = normalizeText(formData.get('url'))

  if (!url) {
    redirect(getMessagePath('error', 'Image URL is required.'))
  }

  let validatedUrl: URL
  try {
    validatedUrl = new URL(url)
  } catch {
    redirect(getMessagePath('error', 'Please provide a valid absolute URL.'))
  }

  const { error } = await supabase
    .from('images')
    .insert({
      url: validatedUrl.toString(),
      profile_id: user.id,
      created_by_user_id: user.id,
      modified_by_user_id: user.id,
    })

  if (error) {
    redirect(getMessagePath('error', `Create failed: ${error.message}`))
  }

  revalidateAdminRoutes()
  redirect(getMessagePath('success', 'Image created.'))
}

export async function updateImageAction(formData: FormData) {
  const { supabase, user } = await requireSuperadminOrMatrixAdmin()
  const id = normalizeText(formData.get('id'))
  const url = normalizeText(formData.get('url'))

  if (!id || !url) {
    redirect(getMessagePath('error', 'Image ID and URL are required for update.'))
  }

  let validatedUrl: URL
  try {
    validatedUrl = new URL(url)
  } catch {
    redirect(getMessagePath('error', 'Please provide a valid absolute URL.'))
  }

  const { error } = await supabase
    .from('images')
    .update({ url: validatedUrl.toString(), modified_by_user_id: user.id })
    .eq('id', id)

  if (error) {
    redirect(getMessagePath('error', `Update failed: ${error.message}`))
  }

  revalidateAdminRoutes()
  redirect(getMessagePath('success', `Image ${id.slice(0, 8)} updated.`))
}

export async function deleteImageAction(formData: FormData) {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const id = normalizeText(formData.get('id'))

  if (!id) {
    redirect(getMessagePath('error', 'Image ID is required for delete.'))
  }

  const { error } = await supabase
    .from('images')
    .delete()
    .eq('id', id)

  if (error) {
    redirect(getMessagePath('error', `Delete failed: ${error.message}`))
  }

  revalidateAdminRoutes()
  redirect(getMessagePath('success', `Image ${id.slice(0, 8)} deleted.`))
}
