'use client'

import { createClient } from '@/lib/supabase/client'
import { useMemo, useState } from 'react'

const PIPELINE_BASE_URL = 'https://api.almostcrackd.ai'

type UiStatus = 'idle' | 'saving' | 'success' | 'error'

interface ImageOption {
  id: string
  url: string
}

interface FlavorOption {
  id: string
  label: string
}

interface UploadImageFromUrlResponse {
  imageId: string
}

interface PromptChainTesterProps {
  images: ImageOption[]
  flavors: FlavorOption[]
  defaultFlavorId: string
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

async function generateCaptionsWithFlavor(token: string, imageId: string, flavorId: string) {
  const payloads: Record<string, unknown>[] = flavorId
    ? [
        { imageId, humorFlavorId: flavorId },
        { imageId, humor_flavor_id: flavorId },
        { imageId, flavorId },
        { imageId, humorFlavor: flavorId },
      ]
    : [{ imageId }]

  const errors: string[] = []

  for (const payload of payloads) {
    try {
      return await callPipelineApi<unknown>('/pipeline/generate-captions', token, payload)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown API error')
    }
  }

  throw new Error(errors.join(' | '))
}

export function PromptChainTester({ images, flavors, defaultFlavorId }: PromptChainTesterProps) {
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<UiStatus>('idle')
  const [message, setMessage] = useState('')
  const [selectedImageId, setSelectedImageId] = useState(images[0]?.id ?? '')
  const [selectedFlavorId, setSelectedFlavorId] = useState(defaultFlavorId || flavors[0]?.id || '')
  const [generatedCaptions, setGeneratedCaptions] = useState<CaptionRecord[]>([])

  const selectedImage = images.find((image) => image.id === selectedImageId) ?? null

  const handleGenerate = async () => {
    setStatus('saving')
    setMessage('Preparing pipeline request...')
    setGeneratedCaptions([])

    if (!selectedImage) {
      setStatus('error')
      setMessage('Pick an image from the test set first.')
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
      setMessage('Step 1/2: Registering selected image URL...')
      const uploadImageResponse = await callPipelineApi<UploadImageFromUrlResponse>(
        '/pipeline/upload-image-from-url',
        accessToken,
        {
          imageUrl: selectedImage.url,
          isCommonUse: true,
        }
      )

      if (!uploadImageResponse.imageId) {
        throw new Error('Missing imageId in upload-image-from-url response.')
      }

      setMessage('Step 2/2: Generating captions from selected flavor...')
      const generatedRecords = await generateCaptionsWithFlavor(
        accessToken,
        uploadImageResponse.imageId,
        selectedFlavorId
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
          ? `Generated ${normalizedCaptions.length} caption(s).`
          : 'Pipeline completed but returned zero caption rows.'
      )
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Pipeline request failed.')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-950/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Pipeline Test</p>
      <h3 className="mt-2 text-xl font-semibold">Generate Captions From Image Test Set</h3>
      <p className="mt-2 text-sm text-slate-300">
        Uses `api.almostcrackd.ai` with your current auth token and selected humor flavor.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm text-slate-200">
          Humor flavor
          <select
            value={selectedFlavorId}
            onChange={(event) => setSelectedFlavorId(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2"
          >
            <option value="">(No explicit flavor id)</option>
            {flavors.map((flavor) => (
              <option key={flavor.id} value={flavor.id}>
                {flavor.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm text-slate-200">
          Test image
          <select
            value={selectedImageId}
            onChange={(event) => setSelectedImageId(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2"
          >
            {images.map((image) => (
              <option key={image.id} value={image.id}>
                {image.id.slice(0, 8)} | {image.url}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedImage && (
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-2 text-xs text-slate-300">
          Selected image URL: <span className="break-all">{selectedImage.url}</span>
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          disabled={status === 'saving' || !selectedImage}
          onClick={handleGenerate}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'saving' ? 'Running pipeline...' : 'Generate Captions'}
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            status === 'error'
              ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
              : status === 'success'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                : 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
          }`}
        >
          {message}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {generatedCaptions.length === 0 && (
          <p className="text-sm text-slate-400">No generated results yet.</p>
        )}
        {generatedCaptions.map((caption, index) => (
          <article key={`generated-${index}`} className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <p className="text-sm text-slate-100">{getCaptionText(caption, index)}</p>
            <pre className="mt-2 max-h-52 overflow-auto rounded-md border border-slate-700 bg-slate-950 p-2 text-[11px] text-slate-400">
              {JSON.stringify(caption, null, 2)}
            </pre>
          </article>
        ))}
      </div>
    </section>
  )
}
