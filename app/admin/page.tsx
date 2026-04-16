import Image from 'next/image'
import Link from 'next/link'

import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

type ImageRow = {
  id: string
  url: string | null
}

type CaptionRow = {
  id: string
  profile_id: string | null
  image_id: string | null
  created_datetime_utc: string | null
  is_public: boolean | null
  content: string | null
}

type VoteRow = {
  caption_id?: unknown
  vote_value?: unknown
  profile_id?: unknown
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}

function asCleanText(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function normalizeDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export default async function AdminDashboardPage() {
  const { supabase } = await requireSuperadminOrMatrixAdmin()

  const [
    profilesCountResult,
    superadminsCountResult,
    imagesCountResult,
    captionsCountResult,
    publicCaptionsCountResult,
    votesCountResult,
    imagesResult,
    captionsResult,
    votesResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_superadmin', true),
    supabase.from('images').select('*', { count: 'exact', head: true }),
    supabase.from('captions').select('*', { count: 'exact', head: true }),
    supabase.from('captions').select('*', { count: 'exact', head: true }).eq('is_public', true),
    supabase.from('caption_votes').select('*', { count: 'exact', head: true }),
    supabase.from('images').select('id, url').limit(2000),
    supabase
      .from('captions')
      .select('id, profile_id, image_id, created_datetime_utc, is_public, content')
      .order('created_datetime_utc', { ascending: false })
      .limit(2000),
    supabase.from('caption_votes').select('*').limit(6000),
  ])

  const errors = [
    profilesCountResult.error,
    superadminsCountResult.error,
    imagesCountResult.error,
    captionsCountResult.error,
    publicCaptionsCountResult.error,
    votesCountResult.error,
    imagesResult.error,
    captionsResult.error,
    votesResult.error,
  ]
    .filter((error): error is NonNullable<typeof imagesResult.error> => Boolean(error))
    .map((error) => error.message)

  const images = (imagesResult.data ?? []) as ImageRow[]
  const captions = (captionsResult.data ?? []) as CaptionRow[]
  const votes = (votesResult.data ?? []) as VoteRow[]

  const totalProfiles = profilesCountResult.count ?? 0
  const totalSuperadmins = superadminsCountResult.count ?? 0
  const totalImages = imagesCountResult.count ?? 0
  const totalCaptions = captionsCountResult.count ?? 0
  const totalVotes = votesCountResult.count ?? 0
  const publicCaptions = publicCaptionsCountResult.count ?? 0

  const captionsPerImage = totalImages > 0 ? totalCaptions / totalImages : 0
  const publicCaptionPercent = totalCaptions > 0 ? (publicCaptions / totalCaptions) * 100 : 0

  const captionsByProfile = new Map<string, number>()
  const captionsByImage = new Map<string, number>()
  const captionsByHour = Array.from({ length: 24 }, () => 0)
  const weekdayCounts = new Map<string, number>()

  for (const caption of captions) {
    if (caption.profile_id) {
      captionsByProfile.set(caption.profile_id, (captionsByProfile.get(caption.profile_id) ?? 0) + 1)
    }

    if (caption.image_id) {
      captionsByImage.set(caption.image_id, (captionsByImage.get(caption.image_id) ?? 0) + 1)
    }

    const date = normalizeDate(caption.created_datetime_utc)
    if (!date) continue

    captionsByHour[date.getHours()] += 1
    const weekday = date.toLocaleString(undefined, { weekday: 'short' })
    weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1)
  }

  const peakHourCount = Math.max(...captionsByHour)
  const peakHourIndex = captionsByHour.findIndex((count) => count === peakHourCount)

  const topProfiles = [...captionsByProfile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const imageUrlById = new Map(images.map((image) => [image.id, image.url ?? '']))

  const topImages = [...captionsByImage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([imageId, captionCount]) => ({
      imageId,
      captionCount,
      url: imageUrlById.get(imageId) ?? '',
    }))

  const voteScoreByCaption = new Map<string, number>()
  const voteCountByCaption = new Map<string, number>()
  const ratersByCaption = new Map<string, Set<string>>()
  const ratingsByProfile = new Map<string, number>()
  let validVoteCount = 0
  let positiveVoteCount = 0

  for (const vote of votes) {
    const captionId = asCleanText(vote.caption_id)
    if (!captionId) continue

    const parsedVote = typeof vote.vote_value === 'number' ? vote.vote_value : Number(vote.vote_value)
    if (!Number.isFinite(parsedVote)) continue

    validVoteCount += 1
    if (parsedVote > 0) {
      positiveVoteCount += 1
    }

    voteScoreByCaption.set(captionId, (voteScoreByCaption.get(captionId) ?? 0) + parsedVote)
    voteCountByCaption.set(captionId, (voteCountByCaption.get(captionId) ?? 0) + 1)

    const profileId = asCleanText(vote.profile_id)
    if (!profileId) continue

    ratingsByProfile.set(profileId, (ratingsByProfile.get(profileId) ?? 0) + 1)
    const raterSet = ratersByCaption.get(captionId) ?? new Set<string>()
    raterSet.add(profileId)
    ratersByCaption.set(captionId, raterSet)
  }

  const captionById = new Map(captions.map((caption) => [caption.id, caption]))
  const ratedCaptionCount = voteCountByCaption.size
  const uniqueRaterCount = ratingsByProfile.size
  const averageRatingsPerRatedCaption = ratedCaptionCount > 0 ? validVoteCount / ratedCaptionCount : 0
  const positiveVotePercent = validVoteCount > 0 ? (positiveVoteCount / validVoteCount) * 100 : 0

  const topRatedCaptionIds = [...voteScoreByCaption.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([captionId]) => captionId)

  const mostRatedCaptionIds = [...voteCountByCaption.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1]
      return (voteScoreByCaption.get(b[0]) ?? 0) - (voteScoreByCaption.get(a[0]) ?? 0)
    })
    .slice(0, 5)
    .map(([captionId]) => captionId)

  const neededRatedCaptionIds = [...new Set([...topRatedCaptionIds, ...mostRatedCaptionIds])]
  const missingRatedCaptionIds = neededRatedCaptionIds.filter((captionId) => !captionById.has(captionId))

  if (missingRatedCaptionIds.length > 0) {
    const { data: missingCaptionRows, error: missingCaptionsError } = await supabase
      .from('captions')
      .select('id, profile_id, image_id, created_datetime_utc, is_public, content')
      .in('id', missingRatedCaptionIds)
      .limit(500)

    if (missingCaptionsError) {
      errors.push(missingCaptionsError.message)
    } else {
      for (const row of (missingCaptionRows ?? []) as CaptionRow[]) {
        if (!row.id) continue
        captionById.set(row.id, row)
      }
    }
  }

  const neededRatedImageIds = [...new Set(
    neededRatedCaptionIds
      .map((captionId) => captionById.get(captionId)?.image_id ?? null)
      .filter((value): value is string => Boolean(value))
  )]
  const missingRatedImageIds = neededRatedImageIds.filter((imageId) => !asCleanText(imageUrlById.get(imageId)))

  if (missingRatedImageIds.length > 0) {
    const { data: missingImageRows, error: missingImagesError } = await supabase
      .from('images')
      .select('id, url')
      .in('id', missingRatedImageIds)
      .limit(500)

    if (missingImagesError) {
      errors.push(missingImagesError.message)
    } else {
      for (const row of (missingImageRows ?? []) as ImageRow[]) {
        if (!row.id) continue
        imageUrlById.set(row.id, row.url ?? '')
      }
    }
  }

  const topRatedCaptions = topRatedCaptionIds.map((captionId) => {
    const caption = captionById.get(captionId)
    return {
      captionId,
      score: voteScoreByCaption.get(captionId) ?? 0,
      content: caption?.content?.trim() || '(No caption content)',
      imageId: caption?.image_id ?? '',
      imageUrl: caption?.image_id ? (imageUrlById.get(caption.image_id) ?? '') : '',
    }
  })

  const mostRatedCaptions = mostRatedCaptionIds
    .map((captionId) => {
      const score = voteScoreByCaption.get(captionId) ?? 0
      const ratingCount = voteCountByCaption.get(captionId) ?? 0
      const averageScore = ratingCount > 0 ? score / ratingCount : 0
      const caption = captionById.get(captionId)

      return {
        captionId,
        ratingCount,
        uniqueRaters: ratersByCaption.get(captionId)?.size ?? 0,
        score,
        averageScore,
        content: caption?.content?.trim() || '(No caption content)',
        imageId: caption?.image_id ?? '',
        imageUrl: caption?.image_id ? (imageUrlById.get(caption.image_id) ?? '') : '',
      }
    })

  const topRaters = [...ratingsByProfile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const weekdaySummary = [...weekdayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Overview</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Humor Data Overview</h2>
          <Link
            href="/admin/operations"
            className="admin-cta-link inline-flex rounded-lg border border-cyan-300/40 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
          >
            Open Data Operations
          </Link>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Snapshot of activity across accounts, uploads, captions, and votes.
        </p>
        <p className="mt-1 max-w-3xl text-xs text-slate-400">
          KPI totals use exact counts; charts below use recent sampled rows for responsiveness.
        </p>
        {errors.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Some data failed to load: {errors.join(' | ')}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Profiles</p>
          <p className="mt-2 text-3xl font-semibold">{totalProfiles}</p>
          <p className="mt-1 text-xs text-slate-400">{totalSuperadmins} superadmins</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Images</p>
          <p className="mt-2 text-3xl font-semibold">{totalImages}</p>
          <p className="mt-1 text-xs text-slate-400">Uploads in catalog</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Captions</p>
          <p className="mt-2 text-3xl font-semibold">{totalCaptions}</p>
          <p className="mt-1 text-xs text-slate-400">{formatPercent(publicCaptionPercent)} public</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Votes</p>
          <p className="mt-2 text-3xl font-semibold">{totalVotes}</p>
          <p className="mt-1 text-xs text-slate-400">Ratings recorded</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Density</p>
          <p className="mt-2 text-3xl font-semibold">{captionsPerImage.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-400">Captions per image</p>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 xl:col-span-2">
          <h3 className="text-lg font-semibold">Caption Burst By Hour</h3>
          <p className="mt-1 text-xs text-slate-400">
            Peak activity hour: {peakHourIndex >= 0 ? `${peakHourIndex}:00` : 'n/a'} ({peakHourCount} captions)
          </p>
          <div className="mt-4 grid grid-cols-12 gap-2 md:grid-cols-24">
            {captionsByHour.map((count, hour) => {
              const pct = peakHourCount > 0 ? Math.max(8, Math.round((count / peakHourCount) * 100)) : 8
              return (
                <div key={hour} className="flex flex-col items-center gap-1">
                  <div className="flex h-28 w-full items-end rounded bg-slate-800/60 p-1">
                    <div
                      className="w-full rounded bg-gradient-to-t from-cyan-500 to-blue-400"
                      style={{ height: `${pct}%` }}
                      title={`${hour}:00 => ${count}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{hour}</span>
                </div>
              )
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <h3 className="text-lg font-semibold">Top Posting Profiles</h3>
          <div className="mt-4 space-y-3">
            {topProfiles.length === 0 && <p className="text-sm text-slate-400">No profile activity yet.</p>}
            {topProfiles.map(([profileId, count]) => (
              <div key={profileId}>
                <div className="flex items-center justify-between text-sm">
                  <span className="max-w-[70%] truncate text-slate-200" title={profileId}>
                    {profileId}
                  </span>
                  <span className="font-semibold text-cyan-200">{count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-cyan-400"
                    style={{ width: `${Math.max(12, Math.round((count / (topProfiles[0]?.[1] ?? 1)) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <h3 className="text-lg font-semibold">Caption Rating Activity</h3>
        <p className="mt-1 text-sm text-slate-300">
          Statistics focused on the captions users are rating.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Rated Captions</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-200">{ratedCaptionCount}</p>
          </article>
          <article className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Unique Raters</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-200">{uniqueRaterCount}</p>
          </article>
          <article className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Avg Ratings / Caption</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-200">{averageRatingsPerRatedCaption.toFixed(2)}</p>
          </article>
          <article className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Positive Vote Share</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-200">{formatPercent(positiveVotePercent)}</p>
          </article>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <article className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="text-sm font-semibold text-slate-100">Most Rated Captions</h4>
            <div className="mt-3 space-y-3">
              {mostRatedCaptions.length === 0 && <p className="text-sm text-slate-400">No ratings yet.</p>}
              {mostRatedCaptions.map((caption) => (
                <div key={caption.captionId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-start gap-3">
                    {caption.imageUrl ? (
                      <Image
                        src={caption.imageUrl}
                        alt={`Image ${caption.imageId || 'n/a'}`}
                        width={56}
                        height={56}
                        unoptimized
                        className="h-14 w-14 rounded-lg border border-slate-700 object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-700 text-[10px] text-slate-400">
                        no img
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-100">{caption.content}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-400" title={caption.imageId || 'n/a'}>
                        Image No: {caption.imageId || 'n/a'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-cyan-200">
                    {caption.ratingCount} ratings | avg {caption.averageScore.toFixed(2)} | score {caption.score}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{caption.uniqueRaters} unique raters</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="text-sm font-semibold text-slate-100">Most Active Raters</h4>
            <div className="mt-3 space-y-2">
              {topRaters.length === 0 && <p className="text-sm text-slate-400">No rater activity yet.</p>}
              {topRaters.map(([profileId, ratingCount]) => (
                <div key={profileId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <p className="truncate text-xs text-slate-300" title={profileId}>
                    {profileId}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-cyan-200">{ratingCount} ratings</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <h3 className="text-lg font-semibold">Most Captioned Images</h3>
          <div className="mt-4 space-y-3">
            {topImages.length === 0 && <p className="text-sm text-slate-400">No image-caption relationships yet.</p>}
            {topImages.map((image) => (
              <div key={image.imageId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center gap-3">
                  {image.url ? (
                    <Image
                      src={image.url}
                      alt={`Image ${image.imageId}`}
                      width={56}
                      height={56}
                      unoptimized
                      className="h-14 w-14 rounded-lg border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-700 text-[10px] text-slate-400">
                      no img
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-300" title={image.imageId}>
                      {image.imageId}
                    </p>
                    <p className="text-sm font-semibold text-cyan-200">{image.captionCount} captions</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <h3 className="text-lg font-semibold">Highest Rated Captions</h3>
          <div className="mt-4 space-y-3">
            {topRatedCaptions.length === 0 && <p className="text-sm text-slate-400">No votes yet.</p>}
            {topRatedCaptions.map((caption) => (
              <div key={caption.captionId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-start gap-3">
                  {caption.imageUrl ? (
                    <Image
                      src={caption.imageUrl}
                      alt={`Image ${caption.imageId || 'n/a'}`}
                      width={56}
                      height={56}
                      unoptimized
                      className="h-14 w-14 rounded-lg border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-700 text-[10px] text-slate-400">
                      no img
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100">{caption.content}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-400" title={caption.imageId || 'n/a'}>
                      Image No: {caption.imageId || 'n/a'}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-cyan-200">Score: {caption.score}</p>
                <p className="mt-1 truncate text-[11px] text-slate-400" title={caption.captionId}>
                  {caption.captionId}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <h3 className="text-lg font-semibold">Weekday Caption Rhythm</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {weekdaySummary.length === 0 && <p className="text-sm text-slate-400">No timestamp data available.</p>}
          {weekdaySummary.map(([weekday, count]) => (
            <div key={weekday} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-sm text-slate-200">{weekday}</p>
              <p className="mt-1 text-xl font-semibold text-cyan-200">{count}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
