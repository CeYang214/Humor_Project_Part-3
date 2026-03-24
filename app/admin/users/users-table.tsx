'use client'

import { useMemo, useState } from 'react'

type ProfileRecord = Record<string, unknown>

function getString(record: ProfileRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function getBoolean(record: ProfileRecord, key: string) {
  const value = record[key]
  return value === true || value === 'true' || value === 1 || value === '1'
}

function formatDate(value: unknown) {
  if (typeof value !== 'string') return 'n/a'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

interface UsersTableProps {
  profiles: ProfileRecord[]
}

export function UsersTable({ profiles }: UsersTableProps) {
  const [query, setQuery] = useState('')

  const filteredProfiles = useMemo(() => {
    const cleaned = query.trim().toLowerCase()
    if (!cleaned) return profiles

    return profiles.filter((profile) => {
      const values = [
        getString(profile, ['id']),
        getString(profile, ['email']),
        getString(profile, ['full_name', 'display_name', 'username']),
        JSON.stringify(profile),
      ]
      return values.some((value) => value.toLowerCase().includes(cleaned))
    })
  }, [profiles, query])

  const superadminCount = profiles.filter((profile) => getBoolean(profile, 'is_superadmin')).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-300">{profiles.length} profiles loaded</p>
          <p className="text-xs text-slate-400">{superadminCount} superadmins</p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by id, name, email..."
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none sm:w-80"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-3 py-3">Profile</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3">Raw Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/70">
            {filteredProfiles.map((profile) => {
              const id = getString(profile, ['id']) || '(unknown id)'
              const name = getString(profile, ['full_name', 'display_name', 'username']) || 'Unnamed'
              const email = getString(profile, ['email']) || 'n/a'
              const created = profile.created_datetime_utc ?? profile.created_at ?? profile.inserted_at ?? null
              const isSuperadmin = getBoolean(profile, 'is_superadmin')

              return (
                <tr key={id} className="align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-100">{name}</p>
                    <p className="max-w-[24ch] truncate text-xs text-slate-400" title={id}>
                      {id}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-slate-200">{email}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs ${
                        isSuperadmin
                          ? 'admin-super-badge bg-cyan-500/20 text-cyan-200'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isSuperadmin ? 'superadmin' : 'standard'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{formatDate(created)}</td>
                  <td className="px-3 py-3">
                    <pre className="max-w-[36ch] overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-2 text-xs text-slate-400">
                      {JSON.stringify(profile, null, 2)}
                    </pre>
                  </td>
                </tr>
              )
            })}
            {filteredProfiles.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={5}>
                  No profiles match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
