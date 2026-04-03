'use client'

import { useEffect, useState } from 'react'

type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'humor-admin-theme-mode'

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return

  if (mode === 'system') {
    delete document.documentElement.dataset.theme
    return
  }

  document.documentElement.dataset.theme = mode
}

export function ThemeModeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system'

    const savedMode = localStorage.getItem(STORAGE_KEY)
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
      return savedMode
    }

    return 'system'
  })

  useEffect(() => {
    applyTheme(mode)
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  const handleModeChange = (nextMode: ThemeMode) => {
    setMode(nextMode)
    localStorage.setItem(STORAGE_KEY, nextMode)
    applyTheme(nextMode)
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Theme</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {(['system', 'light', 'dark'] as ThemeMode[]).map((theme) => {
          const isActive = mode === theme
          return (
            <button
              key={theme}
              type="button"
              onClick={() => handleModeChange(theme)}
              className={`admin-theme-mode-btn rounded-md border px-2 py-1 text-xs capitalize transition ${
                isActive
                  ? 'admin-theme-mode-btn-active border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {theme}
            </button>
          )
        })}
      </div>
    </div>
  )
}
