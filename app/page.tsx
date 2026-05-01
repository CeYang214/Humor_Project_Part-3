'use client'

import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface Caption {
  id: string
  content: string | null
  created_datetime_utc: string
  is_public: boolean
  profile_id: string
  image_id: string
  imageUrl?: string // We'll add the URL separately
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
  const { supabase, supabaseInitError } = useMemo(() => {
    try {
      return { supabase: createClient(), supabaseInitError: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize Supabase client.'
      console.error('Supabase client init error:', error)
      return { supabase: null, supabaseInitError: message }
    }
  }, [])
  const [captions, setCaptions] = useState<Caption[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pageInput, setPageInput] = useState('1')
  const [searchInput, setSearchInput] = useState('')
  const [captionQuery, setCaptionQuery] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [userVotes, setUserVotes] = useState<Record<string, number>>({})
  const [voteStatus, setVoteStatus] = useState<Record<string, 'idle' | 'saving' | 'success' | 'error'>>({})
  const [voteMessage, setVoteMessage] = useState<Record<string, string>>({})
  const captionsPerPage = 36
  const normalizedCaptionQuery = captionQuery.trim().toLowerCase()
  const filteredCaptions = useMemo(() => {
    if (!normalizedCaptionQuery) return captions

    return captions.filter((caption) => {
      const content = typeof caption.content === 'string' ? caption.content : ''
      return content.toLowerCase().includes(normalizedCaptionQuery)
    })
  }, [captions, normalizedCaptionQuery])

  const fetchCaptions = useCallback(async () => {
    if (!supabase) {
      setCaptions([])
      setLoading(false)
      return
    }

    setLoading(true)

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
      setLoading(false)
      return
    }

    if (!captionsData || captionsData.length === 0) {
      console.log('No captions data returned')
      setCaptions([])
      setLoading(false)
      return
    }

    console.log(`Fetched ${captionsData.length} captions`)

    // Get unique image IDs
    const imageIds = [...new Set(captionsData.map(c => c.image_id).filter(Boolean))]
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
    const imageMap = new Map(imagesData?.map(img => [img.id, img.url]) || [])

    // Add image URLs to captions
    const captionsWithImages = captionsData.map(caption => ({
      ...caption,
      imageUrl: imageMap.get(caption.image_id) || undefined
    }))

    // Filter to only captions with valid image URLs
    const validCaptions = captionsWithImages.filter(c => c.imageUrl && c.imageUrl.trim() !== '')

    console.log(`${validCaptions.length} captions have valid images`)

    // Take exactly 36 (or whatever we have if less)
    const finalCaptions = validCaptions.slice(0, captionsPerPage)
    console.log(`Displaying ${finalCaptions.length} captions on this page`)

    setCaptions(finalCaptions)
    setLoading(false)

    // Get total count for pagination (only on first load)
    if (currentPage === 1) {
      const { count } = await supabase
        .from('captions')
        .select('*', { count: 'exact', head: true })

      if (count) {
        setTotalPages(Math.ceil(count / (captionsPerPage * fetchMultiplier)))
      }
    }
  }, [currentPage, supabase])

  useEffect(() => {
    void fetchCaptions()
  }, [fetchCaptions])

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

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
    let cancelled = false

    const loadVotes = async () => {
      if (!supabase || !user || captions.length === 0) {
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

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCaptionQuery(searchInput)
  }

  const handleClearSearch = () => {
    setSearchInput('')
    setCaptionQuery('')
  }

  const handleSignIn = async () => {
    if (!supabase) return

    const origin = window.location.origin
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })
  }

  const handleSignOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const handleVote = async (captionId: string, value: number) => {
    if (!supabase) {
      setVoteStatus(prev => ({ ...prev, [captionId]: 'error' }))
      setVoteMessage(prev => ({ ...prev, [captionId]: 'App configuration error. Please contact support.' }))
      return
    }

    if (!user) {
      setVoteStatus(prev => ({ ...prev, [captionId]: 'error' }))
      setVoteMessage(prev => ({ ...prev, [captionId]: 'Sign in to vote.' }))
      return
    }

    setVoteStatus(prev => ({ ...prev, [captionId]: 'saving' }))
    setVoteMessage(prev => ({ ...prev, [captionId]: '' }))

    const { error } = await supabase.from('caption_votes').upsert(
      {
        caption_id: captionId,
        profile_id: user.id,
        vote_value: value,
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      },
      {
        onConflict: 'profile_id,caption_id',
      }
    )

    if (error) {
      setVoteStatus(prev => ({ ...prev, [captionId]: 'error' }))
      setVoteMessage(prev => ({ ...prev, [captionId]: error.message }))
      return
    }

    setUserVotes(prev => ({ ...prev, [captionId]: value }))
    setVoteStatus(prev => ({ ...prev, [captionId]: 'success' }))
    setVoteMessage(prev => ({ ...prev, [captionId]: 'Vote saved.' }))
  }

  if (supabaseInitError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <main className="container mx-auto px-4 py-12">
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      <main className="container mx-auto px-4 py-12">
        <header className="mx-auto mb-10 max-w-4xl text-center">
          <p className="text-sm uppercase tracking-[0.25em] text-sky-300/80">Caption + Joke Studio</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-300 to-sky-500 sm:text-5xl">
            Browse Captions, Vote, and Generate Jokes from Your Images
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base text-gray-200 sm:text-lg">
            Use the public gallery to explore and search image captions. Sign in only if you want to generate your own captions from uploaded images and save your history.
          </p>
        </header>

        <section className="mx-auto mb-10 grid max-w-5xl gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/90">No Sign-In Needed</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Explore the caption gallery</h2>
            <p className="mt-3 text-sm text-gray-300">
              Browse and search public captions immediately. You can view the gallery without creating an account.
            </p>
            <a
              href="#caption-gallery"
              className="mt-4 inline-flex rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Jump to Gallery
            </a>
          </article>

          <article className="rounded-2xl border border-sky-300/30 bg-sky-500/10 p-6 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-sky-200">Sign-In Feature</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Generate jokes from your own image</h2>
            <p className="mt-3 text-sm text-sky-100">
              Signing in unlocks the joke generator workspace where you can upload an image, generate captions, and revisit saved results.
            </p>
            <p className="mt-3 text-xs text-sky-100/90">
              {user ? `Signed in as ${user.email ?? 'Google user'}.` : 'Continue with Google to unlock image upload and caption generation.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {user ? (
                <>
                  <Link
                    href="/protected"
                    className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                  >
                    Open Joke Generator
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  onClick={handleSignIn}
                  className="rounded-full bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-sky-600"
                >
                  Continue with Google
                </button>
              )}
            </div>
          </article>
        </section>

        <section id="caption-gallery" className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Community Caption Gallery</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-300">
            Search public captions and vote on your favorites.
          </p>
        </section>

        <form onSubmit={handleSearchSubmit} className="mx-auto mb-8 flex max-w-2xl flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Search Captions</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by caption text"
              className="min-w-[220px] flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-white/40 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Search
            </button>
            {(searchInput || captionQuery) && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                Clear
              </button>
            )}
          </div>
          {normalizedCaptionQuery && (
            <p className="text-xs text-gray-400">
              Showing results for <span className="font-medium text-gray-200">{captionQuery.trim()}</span>
            </p>
          )}
        </form>

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
        ) : filteredCaptions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">No captions match your search on this page.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredCaptions.map((caption) => (
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
  const captionText = typeof caption.content === 'string' ? caption.content : ''
  const captionPreview = captionText.trim() ? captionText.substring(0, 30) : 'Untitled caption'

  const handleImageError = () => {
    setImageError(true)
  }

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out hover:shadow-2xl hover:scale-105">
      {caption.imageUrl && !imageError ? (
        <img
          src={caption.imageUrl}
          alt={`Image for caption: ${captionPreview}`}
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
        <p className="text-lg font-medium text-gray-100 mb-2">{captionText || 'Untitled caption'}</p>
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
