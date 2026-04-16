import Image from 'next/image'
import Link from 'next/link'

import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

type VoteRow = {
  caption_id?: unknown
  vote_value?: unknown
  profile_id?: unknown
}

type CaptionRow = {
  id: string
  content: string | null
  image_id: string | null
  created_datetime_utc: string | null
}

type ImageRow = {
  id: string
  url: string | null
}

type RatedCaptionAggregate = {
  captionId: string
  ratingCount: number
  score: number
  raters: Set<string>
}

const FETCH_BATCH_SIZE = 1000
const MAX_VOTE_ROWS = 50000
const PAGE_SIZE = 50

function asCleanText(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

async function fetchVotesInBatches(
  supabase: Awaited<ReturnType<typeof requireSuperadminOrMatrixAdmin>>['supabase']
) {
  const rows: VoteRow[] = []

  for (let start = 0; start < MAX_VOTE_ROWS; start += FETCH_BATCH_SIZE) {
    const end = Math.min(start + FETCH_BATCH_SIZE - 1, MAX_VOTE_ROWS - 1)
    const { data, error } = await supabase
      .from('caption_votes')
      .select('caption_id, vote_value, profile_id')
      .range(start, end)

    if (error) {
      throw new Error(error.message)
    }

    const batch = (data ?? []) as VoteRow[]
    rows.push(...batch)

    if (batch.length < FETCH_BATCH_SIZE) {
      return { rows, truncated: false }
    }
  }

  return { rows, truncated: true }
}

interface AdminRatingsPageProps {
  searchParams: Promise<{
    page?: string
  }>
}

export default async function AdminRatingsPage({ searchParams }: AdminRatingsPageProps) {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const params = await searchParams
  const errors: string[] = []

  let votes: VoteRow[] = []
  let truncated = false

  try {
    const voteResult = await fetchVotesInBatches(supabase)
    votes = voteResult.rows
    truncated = voteResult.truncated
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Failed to load caption votes.')
  }

  const ratingsByCaption = new Map<string, RatedCaptionAggregate>()

  for (const vote of votes) {
    const captionId = asCleanText(vote.caption_id)
    if (!captionId) continue

    const voteValue = typeof vote.vote_value === 'number' ? vote.vote_value : Number(vote.vote_value)
    if (!Number.isFinite(voteValue)) continue

    const aggregate = ratingsByCaption.get(captionId) ?? {
      captionId,
      ratingCount: 0,
      score: 0,
      raters: new Set<string>(),
    }

    aggregate.ratingCount += 1
    aggregate.score += voteValue

    const raterId = asCleanText(vote.profile_id)
    if (raterId) {
      aggregate.raters.add(raterId)
    }

    ratingsByCaption.set(captionId, aggregate)
  }

  const captionIds = [...ratingsByCaption.keys()]
  const captionById = new Map<string, CaptionRow>()

  for (const idsChunk of chunkArray(captionIds, 500)) {
    const { data, error } = await supabase
      .from('captions')
      .select('id, content, image_id, created_datetime_utc')
      .in('id', idsChunk)

    if (error) {
      errors.push(error.message)
      continue
    }

    for (const row of (data ?? []) as CaptionRow[]) {
      captionById.set(row.id, row)
    }
  }

  const imageIds = [...new Set(
    captionIds
      .map((captionId) => captionById.get(captionId)?.image_id ?? null)
      .filter((value): value is string => Boolean(value))
  )]
  const imageUrlById = new Map<string, string>()

  for (const idsChunk of chunkArray(imageIds, 500)) {
    const { data, error } = await supabase
      .from('images')
      .select('id, url')
      .in('id', idsChunk)

    if (error) {
      errors.push(error.message)
      continue
    }

    for (const row of (data ?? []) as ImageRow[]) {
      imageUrlById.set(row.id, row.url ?? '')
    }
  }

  const ratedCaptions = [...ratingsByCaption.values()]
    .sort((a, b) => {
      if (a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount
      if (a.score !== b.score) return b.score - a.score
      return a.captionId.localeCompare(b.captionId)
    })
    .map((aggregate) => {
      const caption = captionById.get(aggregate.captionId)
      const imageId = caption?.image_id ?? ''
      return {
        captionId: aggregate.captionId,
        captionText: caption?.content?.trim() || '(No caption content)',
        imageId,
        imageUrl: imageId ? (imageUrlById.get(imageId) ?? '') : '',
        ratingCount: aggregate.ratingCount,
        score: aggregate.score,
        averageScore: aggregate.ratingCount > 0 ? aggregate.score / aggregate.ratingCount : 0,
        uniqueRaters: aggregate.raters.size,
      }
    })

  const totalItems = ratedCaptions.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const requestedPage = Number.parseInt(params.page ?? '1', 10)
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, totalPages)
    : 1
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageItems = ratedCaptions.slice(startIndex, startIndex + PAGE_SIZE)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Ratings</p>
        <h2 className="mt-2 text-xl font-semibold">All Rated Captions</h2>
        <p className="mt-2 text-sm text-slate-300">
          Full rated-caption directory aggregated from `caption_votes` (not the dashboard sample cards).
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Loaded {votes.length} vote rows | Rated captions: {totalItems}
          {truncated ? ` | Row cap reached at ${MAX_VOTE_ROWS}` : ''}
        </p>

        {errors.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Data issues: {errors.join(' | ')}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-slate-300">
            Page {currentPage} / {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/ratings?page=${Math.max(1, currentPage - 1)}`}
              className={`rounded-lg border px-3 py-1.5 transition ${
                currentPage > 1
                  ? 'border-slate-700 text-slate-200 hover:border-slate-500'
                  : 'pointer-events-none border-slate-800 text-slate-500'
              }`}
            >
              Previous
            </Link>
            <Link
              href={`/admin/ratings?page=${Math.min(totalPages, currentPage + 1)}`}
              className={`rounded-lg border px-3 py-1.5 transition ${
                currentPage < totalPages
                  ? 'border-slate-700 text-slate-200 hover:border-slate-500'
                  : 'pointer-events-none border-slate-800 text-slate-500'
              }`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {pageItems.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-sm text-slate-400">
              No rated captions found.
            </div>
          )}

          {pageItems.map((item) => (
            <article key={item.captionId} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-start gap-3">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={`Image ${item.imageId || 'n/a'}`}
                    width={64}
                    height={64}
                    unoptimized
                    className="h-16 w-16 rounded-lg border border-slate-700 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-700 text-[10px] text-slate-400">
                    no img
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100">{item.captionText}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-400" title={item.imageId || 'n/a'}>
                    Image No: {item.imageId || 'n/a'}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-slate-500" title={item.captionId}>
                    Caption ID: {item.captionId}
                  </p>
                  <p className="mt-2 text-xs text-cyan-200">
                    {item.ratingCount} ratings | avg {item.averageScore.toFixed(2)} | score {item.score} | {item.uniqueRaters} unique raters
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
