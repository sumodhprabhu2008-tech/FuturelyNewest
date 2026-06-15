'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

export default function ParentSettingsPage() {
  const router = useRouter()
  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ns_user')
      if (stored) {
        const u = JSON.parse(stored)
        setName(u.name ?? null)
        setEmail(u.email ?? null)
      }
    } catch { /* ignore */ }
  }, [])

  function handleLogout() {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_user')
    router.push('/login')
  }

  function initials(n: string | null) {
    if (!n) return 'P'
    return n.trim().split(' ').map(p => p.charAt(0)).join('').slice(0, 2).toUpperCase()
  }

  return (
    <div className="fade-up">
      <h1 style={S.title}>Settings</h1>

      <div style={S.layout}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Profile card */}
          <div className="ns-card" style={S.profileCard}>
            <div style={S.avatar}>{initials(name)}</div>
            <div>
              <div style={S.profileName}>{name ?? 'Parent'}</div>
              <div style={S.profileSub}>Parent account</div>
            </div>
          </div>

          {/* Account info */}
          <div className="ns-card" style={S.card}>
            <p style={S.cardLabel}>Account</p>
            <InfoRow label="Name" value={name ?? '—'} />
            <InfoRow label="Email" value={email ?? '—'} />
            <InfoRow label="Account Type" value="Parent / Guardian" />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ns-card" style={S.card}>
            <p style={S.cardLabel}>Support</p>
            <InfoRow label="Contact" value="support@nextstep.ai" />
            <InfoRow label="Version" value="v1.0 MVP" />
          </div>

          <button style={S.logoutBtn} onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  title:        { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 24 },
  layout:       { display: 'flex', gap: 20, alignItems: 'flex-start' },
  profileCard:  { display: 'flex', alignItems: 'center', gap: 16, padding: 20, marginBottom: 16 },
  avatar:       { width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#00A3CC,#4DC8E0)', color: '#060D10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 },
  profileName:  { fontSize: 17, fontWeight: 700 },
  profileSub:   { fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 },
  card:         { padding: 20, marginBottom: 16 },
  cardLabel:    { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 14 },
  logoutBtn:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 0', color: 'var(--error)', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
}
