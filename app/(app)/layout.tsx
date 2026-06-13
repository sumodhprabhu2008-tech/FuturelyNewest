'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const NAV = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  },
  {
    href: '/grades', label: 'Grades',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  },
  {
    href: '/planner', label: 'Planner',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  },
  {
    href: '/feed', label: 'Study Feed',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  },
  {
    href: '/ai', label: 'AI Chat',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>,
  },
  {
    href: '/settings', label: 'Settings',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  },
]

const SIDEBAR_EXPANDED = 220
const SIDEBAR_COLLAPSED = 64

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [checked, setChecked]     = useState(false)
  const [userName, setUserName]   = useState<string>('Student')
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ns_token')
    const user  = JSON.parse(localStorage.getItem('ns_user') ?? 'null') as { name?: string | null } | null
    if (!token) {
      router.replace('/login')
    } else {
      setChecked(true)
      if (user?.name) setUserName(user.name.split(' ')[0])
    }
  }, [router])

  function handleLogout() {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_user')
    router.push('/login')
  }

  if (!checked) return null

  const sideW = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ ...S.sidebar, width: sideW }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={S.toggleBtn}
        >
          {collapsed ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          )}
        </button>

        <div style={{ ...S.logoRow, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <a href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10 }}>
            <Image src="/logo.svg" alt="NextStep" width={28} height={28} style={{ flexShrink: 0 }} />
            {!collapsed && <span style={S.logoText}>NextStep</span>}
          </a>
        </div>

        <nav style={S.nav}>
          {NAV.map(link => {
            const active = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link key={link.href} href={link.href} style={{ textDecoration: 'none' }} title={collapsed ? link.label : undefined}>
                <div
                  className={`ns-nav-link${active ? ' active' : ''}`}
                  style={{
                    ...(active ? S.navActive : {}),
                    justifyContent: collapsed ? 'center' : undefined,
                    paddingLeft: collapsed ? 0 : undefined,
                    gap: collapsed ? 0 : undefined,
                  }}
                >
                  <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7, color: active ? 'var(--primary)' : 'inherit' }}>
                    {link.icon}
                  </span>
                  {!collapsed && link.label}
                </div>
              </Link>
            )
          })}
        </nav>

        <div style={S.bottom}>
          {!collapsed && (
            <div style={S.userRow}>
              <div style={S.userAvatar}>{userName.charAt(0).toUpperCase()}</div>
              <span style={S.userName}>{userName}</span>
            </div>
          )}
          <button
            className="ns-btn-ghost"
            style={{ ...S.logoutBtn, justifyContent: 'center' }}
            onClick={handleLogout}
            title={collapsed ? 'Log out' : undefined}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {!collapsed && 'Log out'}
          </button>
        </div>
      </aside>

      <main style={{ ...S.main, marginLeft: sideW }}>{children}</main>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  sidebar:    { flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '16px 10px 20px', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, overflow: 'hidden', transition: 'width 0.2s ease' },
  toggleBtn:  { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 'auto', marginBottom: 18, flexShrink: 0, transition: 'background 0.15s' },
  logoRow:    { paddingLeft: 0, marginBottom: 24, display: 'flex' },
  logoText:   { fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px', whiteSpace: 'nowrap' },
  nav:        { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' },
  navActive:  { borderLeft: '2px solid var(--primary)', paddingLeft: 12, marginLeft: 2 },
  bottom:     { borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  userRow:    { display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 4, overflow: 'hidden' },
  userAvatar: { width: 26, height: 26, borderRadius: '50%', background: 'var(--primary-dim)', border: '1px solid var(--primary)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  userName:   { fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  logoutBtn:  { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 12px' },
  main:       { flex: 1, padding: 'var(--page-px)', minHeight: '100vh', transition: 'margin-left 0.2s ease' },
}
