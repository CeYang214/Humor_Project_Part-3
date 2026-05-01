'use client'

import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

const PIPELINE_BASE_URL = 'https://api.almostcrackd.ai'
const SUPPORTED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
])
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic'

type UiStatus = 'idle' | 'saving' | 'success' | 'error'

interface GeneratePresignedUrlResponse {
  presignedUrl: string
  cdnUrl: string
}

interface UploadImageFromUrlResponse {
  imageId: string
}

interface PersistedCaptionRow {
  id: string
  content: string | null
  created_datetime_utc: string | null
  image_id: string
}

interface PersistedImageRow {
  id: string
  url: string | null
}

interface CaptionHistoryGroup {
  imageId: string
  imageUrl: string
  captions: CaptionRecord[]
  latestCreatedAt: string
}

type CaptionRecord = Record<string, unknown>

function getCaptionText(record: CaptionRecord, index: number) {
  const candidates = ['content', 'caption', 'text', 'captionText', 'title']

  for (const field of candidates) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return `Caption ${index + 1}`
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  try {
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return date.toLocaleString()
  }
}

async function parseErrorBody(response: Response) {
  const rawBody = await response.text()

  if (!rawBody) {
    return `Request failed with status ${response.status}.`
  }

  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    if (typeof parsed.message === 'string') return parsed.message
    if (typeof parsed.error === 'string') return parsed.error
    return rawBody
  } catch {
    return rawBody
  }
}

async function callPipelineApi<T>(path: string, token: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${PIPELINE_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await parseErrorBody(response)
    throw new Error(errorBody)
  }

  return (await response.json()) as T
}

export default function ProtectedPage() {
  const { supabase, supabaseInitError } = useMemo(() => {
    try {
      return { supabase: createClient(), supabaseInitError: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize Supabase client.'
      console.error('Supabase client init error:', error)
      return { supabase: null, supabaseInitError: message }
    }
  }, [])
  const [user, setUser] = useState<User | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState('')
  const [generatedCaptions, setGeneratedCaptions] = useState<CaptionRecord[]>([])
  const [captionHistory, setCaptionHistory] = useState<CaptionHistoryGroup[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [status, setStatus] = useState<UiStatus>('idle')
  const [message, setMessage] = useState('')

  const loadSavedHistory = useCallback(
    async (profileId: string, hydrateLatest: boolean) => {
      if (!supabase) {
        setHistoryLoading(false)
        return
      }

      setHistoryLoading(true)

      try {
        const { data: captionsData, error: captionsError } = await supabase
          .from('captions')
          .select('id, content, created_datetime_utc, image_id')
          .eq('profile_id', profileId)
          .order('created_datetime_utc', { ascending: false })
          .limit(300)

        if (captionsError) {
          throw captionsError
        }

        const rows = ((captionsData ?? []) as PersistedCaptionRow[]).filter(
          (row) => typeof row.image_id === 'string' && row.image_id.trim() !== ''
        )

        if (rows.length === 0) {
          setCaptionHistory([])
          if (hydrateLatest) {
            setUploadedImageUrl('')
            setGeneratedCaptions([])
          }
          return
        }

        const imageIds = [...new Set(rows.map((row) => row.image_id))]

        const { data: imagesData, error: imagesError } = await supabase
          .from('images')
          .select('id, url')
          .in('id', imageIds)

        if (imagesError) {
          throw imagesError
        }

        const imageUrlById = new Map<string, string>()
        for (const row of (imagesData ?? []) as PersistedImageRow[]) {
          if (typeof row.id !== 'string') continue
          if (typeof row.url !== 'string') continue
          const trimmed = row.url.trim()
          if (!trimmed) continue
          imageUrlById.set(row.id, trimmed)
        }

        const grouped = new Map<string, CaptionHistoryGroup>()

        for (const row of rows) {
          const imageUrl = imageUrlById.get(row.image_id)
          if (!imageUrl) continue

          const current = grouped.get(row.image_id)
          const record: CaptionRecord = {
            id: row.id,
            content: row.content ?? '',
            created_datetime_utc: row.created_datetime_utc ?? '',
            image_id: row.image_id,
          }

          if (!current) {
            grouped.set(row.image_id, {
              imageId: row.image_id,
              imageUrl,
              captions: [record],
              latestCreatedAt: row.created_datetime_utc ?? '',
            })
            continue
          }

          current.captions.push(record)
          const currentTime = new Date(current.latestCreatedAt).getTime()
          const rowTime = new Date(row.created_datetime_utc ?? '').getTime()
          if (!Number.isNaN(rowTime) && (Number.isNaN(currentTime) || rowTime > currentTime)) {
            current.latestCreatedAt = row.created_datetime_utc ?? current.latestCreatedAt
          }
        }

        const groups = [...grouped.values()].sort((a, b) => {
          const aTime = new Date(a.latestCreatedAt).getTime()
          const bTime = new Date(b.latestCreatedAt).getTime()
          if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
          if (Number.isNaN(aTime)) return 1
          if (Number.isNaN(bTime)) return -1
          return bTime - aTime
        })

        setCaptionHistory(groups)

        if (hydrateLatest) {
          if (groups.length > 0) {
            setUploadedImageUrl(groups[0].imageUrl)
            setGeneratedCaptions(groups[0].captions)
          } else {
            setUploadedImageUrl('')
            setGeneratedCaptions([])
          }
        }
      } catch (error) {
        console.error('Failed to load saved history:', error)
      } finally {
        setHistoryLoading(false)
      }
    },
    [supabase]
  )

  useEffect(() => {
    if (!supabase) {
      setUser(null)
      return
    }

    let cancelled = false

    const syncUser = async () => {
      const { data, error } = await supabase.auth.getUser()

      if (cancelled) return

      if (error) {
        const isInvalidRefreshToken = /invalid refresh token|refresh token not found/i.test(error.message)
        if (isInvalidRefreshToken) {
          await supabase.auth.signOut({ scope: 'local' })
        }
        setUser(null)
        return
      }
      setUser(data.user ?? null)
    }

    void syncUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [selectedFile])

  useEffect(() => {
    if (!user) {
      setCaptionHistory([])
      setUploadedImageUrl('')
      setGeneratedCaptions([])
      return
    }

    void loadSavedHistory(user.id, true)
  }, [user, loadSavedHistory])

  const handleSignOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setStatus('idle')
    setMessage('')
    setGeneratedCaptions([])
    setUploadedImageUrl('')
  }

  const handleLoadHistoryItem = (item: CaptionHistoryGroup) => {
    setUploadedImageUrl(item.imageUrl)
    setGeneratedCaptions(item.captions)
    setStatus('success')
    setMessage('Loaded from your saved history.')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus('saving')
    setMessage('')
    setGeneratedCaptions([])
    setUploadedImageUrl('')

    if (!supabase) {
      setStatus('error')
      setMessage('App configuration error. Please contact support.')
      return
    }

    if (!user) {
      setStatus('error')
      setMessage('You must be signed in to generate captions.')
      return
    }

    if (!selectedFile) {
      setStatus('error')
      setMessage('Please choose an image file first.')
      return
    }

    const contentType = selectedFile.type.toLowerCase()
    if (!SUPPORTED_CONTENT_TYPES.has(contentType)) {
      setStatus('error')
      setMessage(`Unsupported file type "${contentType || 'unknown'}". Use jpeg, jpg, png, webp, gif, or heic.`)
      return
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (sessionError || !accessToken) {
      setStatus('error')
      setMessage(sessionError?.message ?? 'Could not read auth session access token.')
      return
    }

    try {
      setMessage('Step 1/4: Generating presigned upload URL...')
      const presignedResponse = await callPipelineApi<GeneratePresignedUrlResponse>(
        '/pipeline/generate-presigned-url',
        accessToken,
        { contentType }
      )

      if (!presignedResponse.presignedUrl || !presignedResponse.cdnUrl) {
        throw new Error('Missing presignedUrl/cdnUrl in response.')
      }

      setMessage('Step 2/4: Uploading image bytes...')
      const uploadResponse = await fetch(presignedResponse.presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: selectedFile,
      })

      if (!uploadResponse.ok) {
        const uploadError = await parseErrorBody(uploadResponse)
        throw new Error(`Upload failed: ${uploadError}`)
      }

      setUploadedImageUrl(presignedResponse.cdnUrl)

      setMessage('Step 3/4: Registering uploaded image URL...')
      const uploadImageResponse = await callPipelineApi<UploadImageFromUrlResponse>(
        '/pipeline/upload-image-from-url',
        accessToken,
        {
          imageUrl: presignedResponse.cdnUrl,
          isCommonUse: false,
        }
      )

      if (!uploadImageResponse.imageId) {
        throw new Error('Missing imageId in upload-image-from-url response.')
      }

      setMessage('Step 4/4: Generating captions...')
      const generatedRecords = await callPipelineApi<unknown>(
        '/pipeline/generate-captions',
        accessToken,
        {
          imageId: uploadImageResponse.imageId,
        }
      )

      const captions = Array.isArray(generatedRecords)
        ? generatedRecords
        : Array.isArray((generatedRecords as { captions?: unknown[] })?.captions)
          ? ((generatedRecords as { captions: unknown[] }).captions)
          : []

      const normalizedCaptions = captions.filter(
        (item): item is CaptionRecord => Boolean(item && typeof item === 'object')
      )

      setGeneratedCaptions(normalizedCaptions)
      setStatus('success')
      setMessage(
        normalizedCaptions.length > 0
          ? `Done. Generated ${normalizedCaptions.length} caption(s).`
          : 'Pipeline completed, but no caption records were returned.'
      )

      void loadSavedHistory(user.id, false)
    } catch (error: unknown) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Pipeline request failed.')
    }
  }

  if (supabaseInitError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black text-white">
        <main className="container mx-auto px-6 py-16">
          <div className="mx-auto max-w-2xl rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6">
            <h1 className="text-2xl font-bold text-rose-200">Configuration Error</h1>
            <p className="mt-3 text-sm text-rose-100">
              This deployment is missing required Supabase environment variables.
            </p>
            <p className="mt-2 break-words text-xs text-rose-100/90">{supabaseInitError}</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black text-white">
      <main className="container mx-auto px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-sky-300/80">Joke Generator</p>
          <h1 className="mt-4 text-4xl font-bold">Generate captions from your own images</h1>
          <p className="mt-3 text-lg text-slate-200">
            You unlocked this creator workspace by signing in. Upload an image to generate caption ideas and revisit your saved results below.
          </p>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Account</p>
            <p className="mt-2 text-base text-white">
              {user?.email ? `Signed in as ${user.email}` : 'Loading account details...'}
            </p>
          </div>

          {user ? (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Caption Pipeline Upload</p>

              <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-200">
                  Image file
                  <input
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    onChange={handleFileChange}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    required
                  />
                </label>

                <p className="text-xs text-slate-400">
                  Supported types: image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic
                </p>

                {previewUrl && (
                  <div className="relative h-72 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    <Image
                      src={previewUrl}
                      alt="Selected upload preview"
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  </div>
                )}

                {message && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      status === 'success'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        : status === 'error'
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                          : 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                    }`}
                  >
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'saving'}
                  className="mt-2 w-fit rounded-full bg-gradient-to-r from-blue-500 to-sky-500 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'saving' ? 'Running Pipeline...' : 'Upload & Generate Jokes'}
                </button>
              </form>

              {uploadedImageUrl && (
                <div className="mt-6 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm">
                  <p className="text-sky-100">Registered image URL:</p>
                  <p className="mt-1 break-all text-sky-200">{uploadedImageUrl}</p>
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    <img
                      src={uploadedImageUrl}
                      alt="Uploaded image from saved history"
                      className="h-auto max-h-[28rem] w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}

              <div className="mt-6">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Generated Captions</p>
                {generatedCaptions.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-300">No generated captions yet.</p>
                ) : (
                  <div className="mt-3 grid max-h-72 gap-3 overflow-y-auto pr-1">
                    {generatedCaptions.map((record, index) => {
                      const keyValue = record.id
                      const key =
                        typeof keyValue === 'string' || typeof keyValue === 'number'
                          ? String(keyValue)
                          : `generated-${index}`

                      return (
                        <div key={key} className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <p className="text-base font-medium text-white">{getCaptionText(record, index)}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="mt-8 rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Saved History</p>
                {historyLoading ? (
                  <p className="mt-2 text-sm text-slate-300">Loading your saved uploads...</p>
                ) : captionHistory.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-300">No saved history yet.</p>
                ) : (
                  <div className="mt-3 grid max-h-72 gap-3 overflow-y-auto pr-1">
                    {captionHistory.map((item) => (
                      <div key={item.imageId} className="rounded-xl border border-white/10 bg-black/40 p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">{item.captions.length} caption(s)</p>
                          <p className="mt-1 text-xs text-slate-300">{formatTimestamp(item.latestCreatedAt)}</p>
                          <p title={item.imageUrl} className="mt-2 break-all text-xs text-slate-400">
                            {item.imageUrl}
                          </p>
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => handleLoadHistoryItem(item)}
                            className="w-full rounded-full border border-white/25 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                          >
                            Load this result
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
              Sign in to upload images and generate captions.
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Back to Home
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-full bg-gradient-to-r from-blue-500 to-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-sky-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
