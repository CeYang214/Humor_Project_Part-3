'use client'

import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

interface Caption {
  id: string
  content: string
  created_datetime_utc: string
  is_public: boolean
  profile_id: string
  image_id: string
  imageUrl?: string // We'll add the URL separately
}

type CaptionRow = Partial<Caption> & Record<string, unknown>

function toSafeCaption(row: CaptionRow): Caption {
  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    content: typeof row.content === 'string' ? row.content : '',
    created_datetime_utc:
      typeof row.created_datetime_utc === 'string' ? row.created_datetime_utc : '',
    is_public: row.is_public === true,
    profile_id: typeof row.profile_id === 'string' ? row.profile_id : '',
    image_id: typeof row.image_id === 'string' ? row.image_id : '',
    imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined,
  }
}

const SkeletonCard = () => (
  <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg overflow-hidden animate-pulse">
    <div className="w-full h-48 bg-gray-400/50"></div>
    <div className="p-6">
      <div className="h-4 bg-gray-400/50 rounded w-3/4 mb-4"></div>
      <div className="h-3 bg-gray-400/50 rounded w-1/2"></div>
    </div>
  </div>
)

export default function Home() {
  const supabase = useMemo(() => createClient(), [])
  const [captions, setCaptions] = useState<Caption[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pageInput, setPageInput] = useState('1')
  const [user, setUser] = useState<User | null>(null)
  const [userVotes, setUserVotes] = useState<Record<string, number>>({})
  const [voteStatus, setVoteStatus] = useState<Record<string, 'idle' | 'saving' | 'success' | 'error'>>({})
  const [voteMessage, setVoteMessage] = useState<Record<string, string>>({})
  const captionsPerPage = 36

  async function fetchCaptions() {
    setLoading(true)

    try {
      // Fetch MORE captions than we need (about 2x-3x) to account for missing images
      const fetchMultiplier = 3
      const from = (currentPage - 1) * captionsPerPage * fetchMultiplier
      const to = from + (captionsPerPage * fetchMultiplier) - 1

      console.log(`Fetching captions from ${from} to ${to} for page ${currentPage}`)

      // Fetch captions with their image_id
      const { data: captionsData, error: captionsError } = await supabase
        .from('captions')
        .select('id, content, created_datetime_utc, is_public, profile_id, image_id')
        .range(from, to)

      if (captionsError) {
        console.error('Supabase captions error:', captionsError)
        return
      }

      if (!captionsData || captionsData.length === 0) {
        console.log('No captions data returned')
        setCaptions([])
        return
      }

      console.log(`Fetched ${captionsData.length} captions`)

      // Get unique image IDs
      const imageIds = [
        ...new Set(captionsData.map((c) => c.image_id).filter((value): value is string => typeof value === 'string' && value.trim() !== '')),
      ]
      console.log(`Found ${imageIds.length} unique image IDs`)

      // Fetch all images at once
      const { data: imagesData, error: imagesError } = await supabase
        .from('images')
        .select('id, url')
        .in('id', imageIds)

      if (imagesError) {
        console.error('Supabase images error:', imagesError)
      }

      console.log(`Fetched ${imagesData?.length || 0} images`)

      // Create a map of image_id to url
      const imageMap = new Map<string, string>()
      imagesData?.forEach((img) => {
        if (typeof img.id !== 'string') return
        if (typeof img.url !== 'string') return
        const trimmed = img.url.trim()
        if (!trimmed) return
        imageMap.set(img.id, trimmed)
      })

      // Add image URLs to captions
      const captionsWithImages = captionsData.map((caption) =>
        toSafeCaption({
          ...(caption as CaptionRow),
          imageUrl: typeof caption.image_id === 'string' ? imageMap.get(caption.image_id) : undefined,
        })
      )

      // Filter to only captions with valid image URLs
      const validCaptions = captionsWithImages.filter(
        (c) => typeof c.imageUrl === 'string' && c.imageUrl.trim() !== ''
      )

      console.log(`${validCaptions.length} captions have valid images`)

      // Take exactly 36 (or whatever we have if less)
      const finalCaptions = validCaptions.slice(0, captionsPerPage)
      console.log(`Displaying ${finalCaptions.length} captions on this page`)

      setCaptions(finalCaptions)

      // Get total count for pagination (only on first load)
      if (currentPage === 1) {
        const { count } = await supabase
          .from('captions')
          .select('*', { count: 'exact', head: true })

        if (count) {
          setTotalPages(Math.ceil(count / (captionsPerPage * fetchMultiplier)))
        }
      }
    } catch (error) {
      console.error('Failed to fetch captions:', error)
      setCaptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchCaptions()
  }, [currentPage])

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  useEffect(() => {
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
    let cancelled = false

    const loadVotes = async () => {
      if (!user || captions.length === 0) {
        setUserVotes({})
        return
      }

      const captionIds = captions.map(caption => caption.id)
      const { data, error } = await supabase
        .from('caption_votes')
        .select('caption_id, vote_value')
        .eq('profile_id', user.id)
        .in('caption_id', captionIds)

      if (cancelled) return

      if (error) {
        console.error('Supabase caption_votes error:', error)
        return
      }

      const votesByCaption: Record<string, number> = {}
      data?.forEach((vote) => {
        votesByCaption[vote.caption_id] = vote.vote_value
      })
      setUserVotes(votesByCaption)
    }

    void loadVotes()

    return () => {
      cancelled = true
    }
  }, [user, captions, supabase])

  const goToPage = (page: number) => {
    if (totalPages < 1) return
    const clampedPage = Math.min(Math.max(page, 1), totalPages)
    if (clampedPage === currentPage) return
    setCurrentPage(clampedPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToNextPage = () => {
    goToPage(currentPage + 1)
  }

  const goToPrevPage = () => {
    goToPage(currentPage - 1)
  }

  const handlePageJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedPage = Number.parseInt(pageInput, 10)
    if (Number.isNaN(parsedPage)) {
      setPageInput(String(currentPage))
      return
    }
    goToPage(parsedPage)
  }

  const handleSignIn = async () => {
    const origin = window.location.origin
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleVote = async (captionId: string, value: number) => {
    if (!user) {
      setVoteStatus(prev => ({ ...prev, [captionId]: 'error' }))
      setVoteMessage(prev => ({ ...prev, [captionId]: 'Sign in to vote.' }))
      return
    }

    setVoteStatus(prev => ({ ...prev, [captionId]: 'saving' }))
    setVoteMessage(prev => ({ ...prev, [captionId]: '' }))

    const { data: existingVote, error: lookupError } = await supabase
      .from('caption_votes')
      .select('caption_id')
      .eq('profile_id', user.id)
      .eq('caption_id', captionId)
      .maybeSingle()

    if (lookupError) {
      setVoteStatus(prev => ({ ...prev, [captionId]: 'error' }))
      setVoteMessage(prev => ({ ...prev, [captionId]: lookupError.message }))
      return
    }

    const { error } = existingVote
      ? await supabase
          .from('caption_votes')
          .update({
            vote_value: value,
            modified_by_user_id: user.id,
          })
          .eq('profile_id', user.id)
          .eq('caption_id', captionId)
      : await supabase
          .from('caption_votes')
          .insert({
            caption_id: captionId,
            profile_id: user.id,
            vote_value: value,
            created_by_user_id: user.id,
            modified_by_user_id: user.id,
          })

    if (error) {
      setVoteStatus(prev => ({ ...prev, [captionId]: 'error' }))
      setVoteMessage(prev => ({ ...prev, [captionId]: error.message }))
      return
    }

    setUserVotes(prev => ({ ...prev, [captionId]: value }))
    setVoteStatus(prev => ({ ...prev, [captionId]: 'success' }))
    setVoteMessage(prev => ({ ...prev, [captionId]: 'Vote saved.' }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      <main className="container mx-auto px-4 py-12">
        <div className="mb-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="text-sm text-gray-300">
            {user ? (
              <span>Signed in as {user.email ?? 'Google user'}</span>
            ) : (
              <span>Sign in to access the gated route.</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/protected"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Go to Gated Route
            </Link>
            {user ? (
              <button
                onClick={handleSignOut}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={handleSignIn}
                className="rounded-full bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-sky-600"
              >
                Continue with Google
              </button>
            )}
          </div>
        </div>
        <header className="text-center mb-12">
          <h1 className="text-5xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Caption Gallery
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            A curated collection of creative and witty captions, paired with their inspiring images.
          </p>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : captions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">No captions with images found on this page.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {captions.map((caption) => (
                <CaptionCard
                  key={caption.id}
                  caption={caption}
                  canVote={Boolean(user)}
                  userVote={userVotes[caption.id]}
                  status={voteStatus[caption.id] ?? 'idle'}
                  message={voteMessage[caption.id] ?? ''}
                  onVote={handleVote}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-center gap-6 mt-12">
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                  currentPage === 1
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                Previous
              </button>

              <span className="text-lg font-medium text-gray-300">
                Page {currentPage} of {totalPages}
              </span>

              <form onSubmit={handlePageJump} className="flex items-center gap-2">
                <label htmlFor="page-input" className="text-sm text-gray-300">
                  Go to
                </label>
                <input
                  id="page-input"
                  type="number"
                  min={1}
                  max={totalPages || 1}
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  className="w-20 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={totalPages < 1}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Go
                </button>
              </form>

              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                  currentPage === totalPages
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

interface CaptionCardProps {
  caption: Caption
  canVote: boolean
  userVote?: number
  status: 'idle' | 'saving' | 'success' | 'error'
  message: string
  onVote: (captionId: string, value: number) => void
}

const CaptionCard: React.FC<CaptionCardProps> = ({ caption, canVote, userVote, status, message, onVote }) => {
  const [imageError, setImageError] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out hover:shadow-2xl hover:scale-105">
      {caption.imageUrl && !imageError ? (
        <img
          src={caption.imageUrl}
          alt={`Image for caption: ${(caption.content || '').slice(0, 30)}`}
          className="w-full h-48 object-cover"
          onError={handleImageError}
        />
      ) : (
        <div className="w-full h-48 bg-gray-800 flex items-center justify-center">
          <p className="text-gray-500">
            {imageError ? 'Image failed to load' : 'No Image'}
          </p>
        </div>
      )}
      <div className="p-6">
        <p className="text-lg font-medium text-gray-100 mb-2">{caption.content || '(No caption text)'}</p>
        <p className="text-sm text-gray-400">
          {new Date(caption.created_datetime_utc).toLocaleDateString()}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => onVote(caption.id, 1)}
            disabled={!canVote || status === 'saving'}
            className={`rounded-full border px-4 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              userVote === 1
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                : 'border-white/20 text-white hover:border-white/40 hover:bg-white/10'
            }`}
          >
            Upvote
          </button>
          <button
            onClick={() => onVote(caption.id, -1)}
            disabled={!canVote || status === 'saving'}
            className={`rounded-full border px-4 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              userVote === -1
                ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                : 'border-white/20 text-white hover:border-white/40 hover:bg-white/10'
            }`}
          >
            Downvote
          </button>
          {!canVote && (
            <span className="text-xs text-gray-400">Sign in to vote</span>
          )}
          {canVote && userVote === 1 && (
            <span className="text-xs text-emerald-300">You upvoted this.</span>
          )}
          {canVote && userVote === -1 && (
            <span className="text-xs text-rose-300">You downvoted this.</span>
          )}
        </div>

        {message && (
          <p
            className={`mt-3 text-xs ${
              status === 'success' ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
