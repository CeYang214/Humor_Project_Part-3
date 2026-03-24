'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'

type CaptionView = {
  id: string
  content: string
  createdAt: string
  profileId: string
  imageId: string
  isPublic: boolean
  imageUrl: string
}

function formatDate(value: string) {
  if (!value) return 'n/a'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

interface CaptionsTableProps {
  captions: CaptionView[]
}

export function CaptionsTable({ captions }: CaptionsTableProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const cleaned = query.trim().toLowerCase()
    if (!cleaned) return captions

    return captions.filter((caption) => {
      return (
        caption.content.toLowerCase().includes(cleaned) ||
        caption.profileId.toLowerCase().includes(cleaned) ||
        caption.imageId.toLowerCase().includes(cleaned) ||
        caption.id.toLowerCase().includes(cleaned)
      )
    })
  }, [captions, query])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300">{captions.length} captions loaded</p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search captions, profile IDs, image IDs..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none sm:w-96"
          />
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.map((caption) => (
          <article key={caption.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="sm:w-44 sm:flex-none">
                {caption.imageUrl ? (
                  <Image
                    src={caption.imageUrl}
                    alt={`Caption ${caption.id}`}
                    width={320}
                    height={180}
                    unoptimized
                    className="h-28 w-full rounded-xl border border-slate-700 object-cover sm:h-32"
                  />
                ) : (
                  <div className="flex h-28 w-full items-center justify-center rounded-xl border border-slate-700 text-xs text-slate-500 sm:h-32">
                    Missing image
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      caption.isPublic ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {caption.isPublic ? 'public' : 'private'}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(caption.createdAt)}</span>
                </div>

                <p className="mt-2 text-sm text-slate-100">{caption.content || '(empty caption content)'}</p>

                <div className="mt-3 grid gap-1 text-xs text-slate-400">
                  <p className="truncate" title={caption.id}>
                    caption_id: {caption.id}
                  </p>
                  <p className="truncate" title={caption.profileId}>
                    profile_id: {caption.profileId || 'n/a'}
                  </p>
                  <p className="truncate" title={caption.imageId}>
                    image_id: {caption.imageId || 'n/a'}
                  </p>
                </div>
              </div>
            </div>
          </article>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-center text-sm text-slate-400">
            No captions match your search.
          </div>
        )}
      </div>
    </div>
  )
}
