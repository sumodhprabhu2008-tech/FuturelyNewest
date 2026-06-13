'use client'

import { useRouter } from 'next/navigation'

export default function ParentSettingsPage() {
  const router = useRouter()

  function handleLogout() {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_user')
    router.push('/login')
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Settings</h1>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Account</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>Parent account settings coming soon.</p>
        <button style={styles.logoutBtn} onClick={handleLogout}>Log Out</button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card:       { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 },
  cardTitle:  { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 16 },
  logoutBtn:  { background: 'transparent', border: 'none', color: 'var(--error)', fontSize: 16, fontWeight: 700, padding: 0, cursor: 'pointer' },
}
