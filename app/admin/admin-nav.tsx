'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/humor-flavors', label: 'Humor Flavors' },
  { href: '/admin/operations', label: 'Data Operations' },
  { href: '/admin/users', label: 'Users / Profiles' },
  { href: '/admin/images', label: 'Images' },
  { href: '/admin/captions', label: 'Captions' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="mt-6 grid gap-2">
      {LINKS.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`admin-nav-link rounded-xl px-3 py-2 text-sm transition ${
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
