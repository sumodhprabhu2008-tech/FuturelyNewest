'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/grades', label: 'Grades', icon: '📊' },
  { href: '/planner', label: 'Planner', icon: '📅' },
  { href: '/feed', label: 'Study Feed', icon: '💬' },
  { href: '/ai', label: 'AI Chat', icon: '🤖' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('ns_token')
    if (!token) {
      router.replace('/login')
    } else {
      setChecked(true)
    }
  }, [router])

  function handleLogout() {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_user')
    router.push('/login')
  }

  if (!checked) return null

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.logoBox}>
          <a href="/dashboard" style={{ textDecoration: 'none' }}>
            <img src="/logo.jpg" alt="NextStep" style={{ width: 140, height: 60, objectFit: 'contain' }} />
          </a>
        </div>
        <nav style={styles.nav}>
          {NAV_LINKS.map(link => {
            const active = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link key={link.href} href={link.href} style={{ textDecoration: 'none' }}>
                <div style={{ ...styles.navLink, ...(active ? styles.navLinkActive : {}) }}>
                  <span style={styles.navIcon}>{link.icon}</span>
                  {link.label}
                </div>
              </Link>
            )
          })}
        </nav>
        <button style={styles.logoutBtn} onClick={handleLogout}>
          Log Out
        </button>
      </aside>

      {/* Main content */}
      <main style={styles.main}>{children}</main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: {
    width: '240px', flexShrink: 0, background: 'var(--surface)',
    borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
    padding: '24px 0', position: 'fixed', top: 0, left: 0, bottom: 0,
  },
  logoBox: {
    display: 'flex', alignItems: 'center', gap: '12px',
    paddingLeft: '20px', marginBottom: '32px',
  },
  logo: {
    width: '36px', height: '36px', borderRadius: '10px', background: 'var(--primary)',
    color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '800', fontSize: '20px',
  },
  logoText: { fontSize: '18px', fontWeight: '700', color: 'var(--text)' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '12px', paddingRight: '12px' },
  navLink: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
    color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
  },
  navLinkActive: {
    background: 'rgba(0,200,150,0.12)',
    color: 'var(--primary)',
    borderLeft: '3px solid var(--primary)',
  },
  navIcon: { fontSize: '16px' },
  logoutBtn: {
    margin: '12px 20px 0', background: 'transparent', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', fontSize: '14px',
  },
  main: { marginLeft: '240px', flex: 1, overflowY: 'auto' as const, padding: '32px' },
}
