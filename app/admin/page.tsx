import Image from 'next/image'
import Link from 'next/link'

import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

type ProfileRow = {
  id: string
  is_superadmin: boolean | null
}

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
  caption_id: string | null
  vote_value: number | null
}

function toBoolean(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}

function normalizeDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export default async function AdminDashboardPage() {
  const { supabase } = await requireSuperadminOrMatrixAdmin()

  const [profilesResult, imagesResult, captionsResult, votesResult] = await Promise.all([
    supabase.from('profiles').select('id, is_superadmin'),
    supabase.from('images').select('id, url'),
    supabase.from('captions').select('id, profile_id, image_id, created_datetime_utc, is_public, content'),
    supabase.from('caption_votes').select('caption_id, vote_value'),
  ])

  const errors = [profilesResult.error, imagesResult.error, captionsResult.error, votesResult.error]
    .filter((error): error is NonNullable<typeof profilesResult.error> => Boolean(error))
    .map((error) => error.message)

  const profiles = (profilesResult.data ?? []) as ProfileRow[]
  const images = (imagesResult.data ?? []) as ImageRow[]
  const captions = (captionsResult.data ?? []) as CaptionRow[]
  const votes = (votesResult.data ?? []) as VoteRow[]

  const totalProfiles = profiles.length
  const totalSuperadmins = profiles.filter((profile) => toBoolean(profile.is_superadmin)).length
  const totalImages = images.length
  const totalCaptions = captions.length
  const totalVotes = votes.length
  const publicCaptions = captions.filter((caption) => caption.is_public === true).length

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
  for (const vote of votes) {
    if (!vote.caption_id || typeof vote.vote_value !== 'number') continue
    voteScoreByCaption.set(vote.caption_id, (voteScoreByCaption.get(vote.caption_id) ?? 0) + vote.vote_value)
  }

  const captionById = new Map(captions.map((caption) => [caption.id, caption]))

  const topRatedCaptions = [...voteScoreByCaption.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([captionId, score]) => {
      const caption = captionById.get(captionId)
      return {
        captionId,
        score,
        content: caption?.content?.trim() || '(No caption content)',
      }
    })

  const weekdaySummary = [...weekdayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Overview</p>
        <h2 className="mt-2 text-3xl font-semibold">Humor Data Control Center</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          Snapshot of platform activity across accounts, uploads, captions, and voting behavior.
        </p>
        <Link
          href="/admin/operations"
          className="mt-4 inline-flex rounded-xl border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
        >
          Open Full Data Operations
        </Link>
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
                <p className="text-sm text-slate-100">{caption.content}</p>
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
