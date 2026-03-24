'use client'

import { useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

const PIPELINE_BASE_URL = 'https://api.almostcrackd.ai'

type CaptionRecord = Record<string, unknown>

interface FlavorOption {
  id: string
  name: string
}

interface TestImageOption {
  id: string
  url: string
}

interface TesterProps {
  flavors: FlavorOption[]
  images: TestImageOption[]
  defaultFlavorId: string
}

interface TestRunResult {
  imageId: string
  imageUrl: string
  status: 'success' | 'error'
  message: string
  captions: string[]
}

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
  const body = await response.text()
  if (!body) return `Request failed with status ${response.status}.`

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    if (typeof parsed.message === 'string') return parsed.message
    if (typeof parsed.error === 'string') return parsed.error
    return body
  } catch {
    return body
  }
}

async function callGenerateCaptions(token: string, imageId: string, flavor: FlavorOption) {
  const payloadCandidates: Record<string, unknown>[] = [
    { imageId, humorFlavor: flavor.name },
    { imageId, humorFlavor: flavor.id },
    { imageId, humorFlavorId: flavor.id },
    { imageId, flavor: flavor.name },
    { imageId, flavorId: flavor.id },
    { imageId, humorFlavor: flavor.id, humorFlavorName: flavor.name },
  ]

  const seen = new Set<string>()
  const errors: string[] = []

  for (const payload of payloadCandidates) {
    const key = JSON.stringify(payload)
    if (seen.has(key)) continue
    seen.add(key)

    const response = await fetch(`${PIPELINE_BASE_URL}/pipeline/generate-captions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorBody = await parseErrorBody(response)
      errors.push(`${response.status}: ${errorBody}`)
      continue
    }

    return (await response.json()) as unknown
  }

  throw new Error(errors[0] ?? 'Failed to generate captions.')
}

function normalizeCaptionList(raw: unknown) {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { captions?: unknown[] })?.captions)
      ? ((raw as { captions: unknown[] }).captions)
      : []

  return list
    .filter((item): item is CaptionRecord => Boolean(item && typeof item === 'object'))
    .map((item, index) => getCaptionText(item, index))
}

export function FlavorTester({ flavors, images, defaultFlavorId }: TesterProps) {
  const supabase = useMemo(() => createClient(), [])
  const [selectedFlavorId, setSelectedFlavorId] = useState(defaultFlavorId)
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>(() => images.slice(0, 3).map((image) => image.id))
  const [isRunning, setIsRunning] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [results, setResults] = useState<TestRunResult[]>([])

  const activeFlavor = useMemo(
    () => flavors.find((flavor) => flavor.id === selectedFlavorId) ?? null,
    [flavors, selectedFlavorId]
  )

  const imageMap = useMemo(() => new Map(images.map((image) => [image.id, image.url])), [images])

  const toggleImage = (imageId: string) => {
    setSelectedImageIds((current) =>
      current.includes(imageId) ? current.filter((id) => id !== imageId) : [...current, imageId]
    )
  }

  const runTestSet = async () => {
    if (!activeFlavor) {
      setStatusMessage('Choose a humor flavor.')
      return
    }

    if (selectedImageIds.length === 0) {
      setStatusMessage('Select at least one test image.')
      return
    }

    setIsRunning(true)
    setResults([])
    setStatusMessage('Loading auth token...')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (sessionError || !token) {
      setIsRunning(false)
      setStatusMessage(sessionError?.message ?? 'Missing auth session access token.')
      return
    }

    const runResults: TestRunResult[] = []

    for (const imageId of selectedImageIds) {
      const imageUrl = imageMap.get(imageId) ?? ''
      setStatusMessage(`Generating captions for image ${imageId.slice(0, 8)}...`)

      try {
        const response = await callGenerateCaptions(token, imageId, activeFlavor)
        const captions = normalizeCaptionList(response)
        runResults.push({
          imageId,
          imageUrl,
          status: 'success',
          message: captions.length > 0 ? `Generated ${captions.length} caption(s).` : 'No captions returned.',
          captions,
        })
      } catch (error) {
        runResults.push({
          imageId,
          imageUrl,
          status: 'error',
          message: error instanceof Error ? error.message : 'Generation failed.',
          captions: [],
        })
      }

      setResults([...runResults])
    }

    const successCount = runResults.filter((item) => item.status === 'success').length
    setStatusMessage(`Completed ${runResults.length} run(s). Success: ${successCount}.`)
    setIsRunning(false)
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Prompt Chain Tester</p>
      <h3 className="mt-2 text-xl font-semibold">Generate Captions With Test Set</h3>
      <p className="mt-1 text-sm text-slate-300">
        Calls `api.almostcrackd.ai` with your selected humor flavor and selected image IDs.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">Humor flavor</span>
          <select
            value={selectedFlavorId}
            onChange={(event) => setSelectedFlavorId(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
          >
            {flavors.map((flavor) => (
              <option key={flavor.id} value={flavor.id}>
                {flavor.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => setSelectedImageIds(images.map((image) => image.id))}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
          >
            Select all images
          </button>
          <button
            type="button"
            onClick={() => setSelectedImageIds([])}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
          >
            Clear image selection
          </button>
        </div>
      </div>

      <div className="mt-4 grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((image) => (
          <label key={image.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedImageIds.includes(image.id)}
                onChange={() => toggleImage(image.id)}
                className="mt-1"
              />
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-300" title={image.id}>
                  {image.id}
                </p>
                <p className="mt-1 truncate text-[11px] text-slate-500" title={image.url}>
                  {image.url}
                </p>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runTestSet}
          disabled={isRunning}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? 'Running test set...' : 'Run Test Set'}
        </button>
        <button
          type="button"
          onClick={() => setResults([])}
          disabled={isRunning}
          className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
        >
          Clear Results
        </button>
      </div>

      {statusMessage && (
        <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          {statusMessage}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {results.length === 0 && <p className="text-sm text-slate-400">No test runs yet.</p>}
        {results.map((result) => (
          <article key={result.imageId} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400" title={result.imageId}>
                image_id: {result.imageId}
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  result.status === 'success'
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-400/40 bg-rose-500/10 text-rose-200'
                }`}
              >
                {result.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{result.message}</p>
            {result.imageUrl && (
              <p className="mt-1 truncate text-xs text-slate-500" title={result.imageUrl}>
                {result.imageUrl}
              </p>
            )}
            {result.captions.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-100">
                {result.captions.map((caption, index) => (
                  <li key={`${result.imageId}-${index}`}>{caption}</li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
