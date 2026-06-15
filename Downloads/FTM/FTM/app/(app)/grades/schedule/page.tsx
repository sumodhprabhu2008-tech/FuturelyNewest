'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../lib/api'

export default function SchedulePage() {
  const router = useRouter()
  const [schedule, setSchedule] = useState<Record<string, string>[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    api.portalSchedule()
      .then(r => {
        const rows = r.schedule ?? []
        setSchedule(rows)
        if (rows.length > 0) setHeaders(Object.keys(rows[0]))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load schedule'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading schedule…</div>

  return (
    <div className="fade-up">
      <button onClick={() => router.push('/grades')} style={S.back}>← Grade Portal</button>
      <h1 style={S.title}>Class Schedule</h1>

      {error && (
        <div style={S.errorBanner}>
          {error}
          {error.toLowerCase().includes('session') && (
            <span> — <a href="/settings" style={{ color: 'var(--warning)', textDecoration: 'underline' }}>reconnect in Settings</a></span>
          )}
        </div>
      )}

      {schedule.length === 0 && !error && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No schedule data available. Connect your school portal in Settings.
        </p>
      )}

      {schedule.length > 0 && (
        <div className="ns-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr>
                {headers.map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {schedule.map((row, i) => (
                <tr key={i} className="ns-tr" style={{ borderTop: '1px solid var(--border)' }}>
                  {headers.map(h => (
                    <td key={h} style={S.td}>{row[h] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  back:       { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:      { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 20 },
  errorBanner:{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
  th:         { textAlign: 'left' as const, padding: '14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  td:         { padding: '12px 14px', fontSize: 13.5, color: 'var(--text)' },
}
