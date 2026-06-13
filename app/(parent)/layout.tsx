'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '/parent/dashboard', label: 'Students',  icon: '👨‍👩‍👧' },
  { href: '/parent/ai',        label: 'AI Chat',   icon: '🤖' },
  { href: '/parent/settings',  label: 'Settings',  icon: '⚙️' },
]

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('ns_token')
    const user  = JSON.parse(localStorage.getItem('ns_user') ?? 'null') as { role?: string } | null
    if (!token) {
      router.replace('/login')
    } else if (user?.role !== 'PARENT') {
      router.replace('/dashboard')
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
      <aside style={styles.sidebar}>
        <div style={styles.logoBox}>
          <a href="/parent/dashboard" style={{ textDecoration: 'none' }}>
            <img src="/logo.jpg" alt="NextStep" style={{ width: 140, height: 60, objectFit: 'contain' }} />
          </a>
        </div>
        <div style={styles.roleBadge}>Parent Account</div>
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
        <button style={styles.logoutBtn} onClick={handleLogout}>Log Out</button>
      </aside>
      <main style={styles.main}>{children}</main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell:         { display: 'flex', minHeight: '100vh' },
  sidebar:       { width: 240, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 0', position: 'fixed', top: 0, left: 0, bottom: 0 },
  logoBox:       { paddingLeft: 20, marginBottom: 8 },
  roleBadge:     { margin: '0 20px 24px', background: 'rgba(0,200,150,0.1)', border: '1px solid rgba(0,200,150,0.25)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--primary)', textAlign: 'center' as const },
  nav:           { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, paddingRight: 12 },
  navLink:       { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer' },
  navLinkActive: { background: 'rgba(0,200,150,0.12)', color: 'var(--primary)', borderLeft: '3px solid var(--primary)' },
  navIcon:       { fontSize: 16 },
  logoutBtn:     { margin: '12px 20px 0', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--text-secondary)', fontSize: 14 },
  main:          { marginLeft: 240, flex: 1, overflowY: 'auto' as const, padding: 32 },
}
