import Image from 'next/image'

import { createImageAction, deleteImageAction, updateImageAction, uploadImageAction } from '@/app/admin/actions'
import { requireSuperadminOrMatrixAdmin } from '@/lib/supabase/admin'

type ImageRecord = Record<string, unknown>

function getString(record: ImageRecord, key: string) {
  const value = record[key]
  if (typeof value === 'string') return value
  return ''
}

function formatDate(value: unknown) {
  if (typeof value !== 'string') return 'n/a'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

interface AdminImagesPageProps {
  searchParams: Promise<{
    status?: string
    message?: string
  }>
}

export default async function AdminImagesPage({ searchParams }: AdminImagesPageProps) {
  const { supabase } = await requireSuperadminOrMatrixAdmin()
  const params = await searchParams

  const { data, error } = await supabase.from('images').select('*').limit(250)
  const images = ((data ?? []) as ImageRecord[])
    .filter((image) => typeof image.id === 'string')
    .sort((a, b) => {
      const aDate = new Date(String(a.created_datetime_utc ?? a.created_at ?? '')).getTime()
      const bDate = new Date(String(b.created_datetime_utc ?? b.created_at ?? '')).getTime()
      if (Number.isNaN(aDate) && Number.isNaN(bDate)) return 0
      if (Number.isNaN(aDate)) return 1
      if (Number.isNaN(bDate)) return -1
      return bDate - aDate
    })

  const bannerStatus = params.status === 'success' ? 'success' : params.status === 'error' ? 'error' : null
  const bannerMessage = typeof params.message === 'string' ? params.message : ''

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Images</p>
        <h2 className="mt-2 text-2xl font-semibold">Image Management (CRUD)</h2>
        <p className="mt-2 text-sm text-slate-300">Create new images, update URLs, and remove broken records.</p>
        {error && (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Failed to load images: {error.message}
          </div>
        )}
        {bannerStatus && bannerMessage && (
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
              bannerStatus === 'success'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                : 'border-rose-400/40 bg-rose-500/10 text-rose-100'
            }`}
          >
            {bannerMessage}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <h3 className="text-lg font-semibold">Create Image</h3>
        <form action={createImageAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-1 text-sm">
            <span className="text-slate-300">Image URL</span>
            <input
              type="url"
              name="url"
              required
              placeholder="https://cdn.example.com/image.png"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600"
          >
            Create
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <h3 className="text-lg font-semibold">Upload Image File</h3>
        <p className="mt-1 text-xs text-slate-400">
          Upload to Supabase Storage, then insert the generated public URL into `images`.
        </p>
        <form action={uploadImageAction} className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="text-slate-300">File</span>
            <input
              type="file"
              name="file"
              accept="image/*"
              required
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Bucket</span>
            <input
              name="bucket"
              defaultValue="images"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Prefix (optional)</span>
            <input
              name="prefix"
              placeholder="admin-uploads"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <div className="md:col-span-4">
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600"
            >
              Upload
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        {images.map((image) => {
          const id = getString(image, 'id')
          const url = getString(image, 'url')
          const owner = getString(image, 'profile_id')
          const created = image.created_datetime_utc ?? image.created_at ?? null

          return (
            <article key={id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="w-full max-w-xl">
                  <p className="truncate text-xs text-slate-400" title={id}>
                    image_id: {id}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500" title={owner || 'n/a'}>
                    profile_id: {owner || 'n/a'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">created: {formatDate(created)}</p>

                  <form action={updateImageAction} className="mt-3 grid gap-2">
                    <input type="hidden" name="id" value={id} />
                    <label className="grid gap-1 text-sm">
                      <span className="text-slate-300">URL</span>
                      <input
                        type="url"
                        name="url"
                        defaultValue={url}
                        required
                        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-xl border border-cyan-500/60 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                      >
                        Update
                      </button>
                    </div>
                  </form>

                  <form action={deleteImageAction} className="mt-2">
                    <input type="hidden" name="id" value={id} />
                    <button
                      type="submit"
                      className="rounded-xl border border-rose-500/60 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
                    >
                      Delete Image
                    </button>
                  </form>
                </div>

                <div className="w-full lg:max-w-sm">
                  {url ? (
                    <Image
                      src={url}
                      alt={`Image ${id}`}
                      width={560}
                      height={320}
                      unoptimized
                      className="h-48 w-full rounded-xl border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center rounded-xl border border-slate-700 text-sm text-slate-500">
                      Missing image URL
                    </div>
                  )}
                </div>
              </div>
            </article>
          )
        })}

        {images.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-center text-sm text-slate-400">
            No image rows found.
          </div>
        )}
      </section>
    </div>
  )
}
