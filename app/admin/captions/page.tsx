import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

import { CaptionsTable } from '@/app/admin/captions/captions-table'

type CaptionRow = {
  id: string
  content: string | null
  created_datetime_utc: string | null
  is_public: boolean | null
  profile_id: string | null
  image_id: string | null
}

export default async function AdminCaptionsPage() {
  const { supabase } = await requireSuperadminOrMatrixAdmin()

  let captionsResult = await supabase
    .from('captions')
    .select('id, content, created_datetime_utc, is_public, profile_id, image_id')
    .order('created_datetime_utc', { ascending: false })
    .limit(500)

  if (captionsResult.error && /column .* does not exist/i.test(captionsResult.error.message)) {
    captionsResult = await supabase
      .from('captions')
      .select('id, content, created_datetime_utc, is_public, profile_id, image_id')
      .limit(500)
  }

  const captions = (captionsResult.data ?? []) as CaptionRow[]

  const imageIds = [...new Set(captions.map((caption) => caption.image_id).filter((value): value is string => Boolean(value)))]

  const imagesResult =
    imageIds.length > 0
      ? await supabase.from('images').select('id, url').in('id', imageIds)
      : { data: [], error: null }

  const imageMap = new Map((imagesResult.data ?? []).map((image) => [image.id, image.url])) as Map<string, string | null>

  const captionViews = captions.map((caption) => ({
    id: caption.id,
    content: caption.content ?? '',
    createdAt: caption.created_datetime_utc ?? '',
    profileId: caption.profile_id ?? '',
    imageId: caption.image_id ?? '',
    isPublic: caption.is_public === true,
    imageUrl: (caption.image_id ? imageMap.get(caption.image_id) : '') ?? '',
  }))

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Captions</p>
        <h2 className="mt-2 text-xl font-semibold">Read-Only Caption Feed</h2>
        <p className="mt-2 text-sm text-slate-300">
          Review caption text, visibility, owners, and image associations.
        </p>
        {captionsResult.error && (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Failed to load captions: {captionsResult.error.message}
          </div>
        )}
        {imagesResult.error && (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Failed to hydrate image URLs: {imagesResult.error.message}
          </div>
        )}
      </section>

      <CaptionsTable captions={captionViews} />
    </div>
  )
}
