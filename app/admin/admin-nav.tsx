'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/humor-flavors', label: 'Humor Flavors' },
  { href: '/admin/operations', label: 'Data Operations' },
  { href: '/admin/users', label: 'Users / Profiles' },
  { href: '/admin/images', label: 'Images' },
  { href: '/admin/captions', label: 'Captions' },
  { href: '/admin/ratings', label: 'Ratings (All)' },
]

function isLinkActive(pathname: string, href: string) {
  if (href === '/admin') {
    return pathname === '/admin'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminNav() {
  const pathname = usePathname()
  const [pendingNav, setPendingNav] = useState<{ href: string; fromPath: string } | null>(null)
  const usePendingPath = pendingNav !== null && pathname === pendingNav.fromPath
  const effectivePath = usePendingPath ? pendingNav.href : pathname

  return (
    <nav className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
      {LINKS.map((link) => {
        const isActive = isLinkActive(effectivePath, link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => {
              setPendingNav({ href: link.href, fromPath: pathname })
            }}
            className={`admin-nav-link rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? 'admin-nav-link-active bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/40'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
