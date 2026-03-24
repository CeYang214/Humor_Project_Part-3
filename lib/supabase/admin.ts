import { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type UnknownRecord = Record<string, unknown>

export interface AdminProfile extends UnknownRecord {
  id: string
  is_superadmin: boolean
  is_matrix_admin: boolean
}

export interface AdminContext {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
  profile: AdminProfile
}

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false

  const normalized = value.trim().toLowerCase()
  return ['true', '1', 't', 'yes', 'y', 'on'].includes(normalized)
}

async function requireAdminRole(options?: { allowMatrixAdmin?: boolean }): Promise<AdminContext> {
  const allowMatrixAdmin = options?.allowMatrixAdmin === true
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/')
  }

  const provider =
    typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider.toLowerCase() : ''
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase())
    : []
  const isGoogleAuth = provider === 'google' || providers.includes('google')

  if (!isGoogleAuth) {
    redirect('/?auth=google-required')
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profileData) {
    redirect('/protected?admin=missing-profile')
  }

  const isSuperadmin = toBoolean((profileData as UnknownRecord).is_superadmin)
  const isMatrixAdmin = toBoolean((profileData as UnknownRecord).is_matrix_admin)

  if (!isSuperadmin && !(allowMatrixAdmin && isMatrixAdmin)) {
    redirect('/protected?admin=forbidden')
  }

  return {
    supabase,
    user,
    profile: {
      ...(profileData as UnknownRecord),
      id: typeof (profileData as UnknownRecord).id === 'string' ? ((profileData as UnknownRecord).id as string) : user.id,
      is_superadmin: isSuperadmin,
      is_matrix_admin: isMatrixAdmin,
    },
  }
}

export async function requireSuperadmin(): Promise<AdminContext> {
  return requireAdminRole({ allowMatrixAdmin: false })
}

export async function requireSuperadminOrMatrixAdmin(): Promise<AdminContext> {
  return requireAdminRole({ allowMatrixAdmin: true })
}
