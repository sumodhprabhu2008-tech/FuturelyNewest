'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../lib/api'

type TranscriptCourse = { name: string; grade: string; credits: string }
type Semester = { year: string; semester: string; courses: TranscriptCourse[] }
interface TranscriptData {
  semesters: Semester[]
  cumulativeGPA: string | null
  weightedGPA: string | null
  unweightedGPA: string | null
  classRank: string | null
  quartile: string | null
}

export default function TranscriptPage() {
  const router = useRouter()
  const [data, setData]     = useState<TranscriptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    api.portalTranscript()
      .then(r => setData(r.transcript as TranscriptData))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load transcript'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading transcript…</div>

  return (
    <div className="fade-up">
      <button onClick={() => router.push('/grades')} style={S.back}>← Grade Portal</button>
      <h1 style={S.title}>Transcript</h1>

      {error && (
        <div style={S.errorBanner}>
          {error}
          {error.toLowerCase().includes('session') && (
            <span> — <a href="/settings" style={{ color: 'var(--warning)', textDecoration: 'underline' }}>reconnect in Settings</a></span>
          )}
        </div>
      )}

      {/* GPA summary cards */}
      <div style={S.gpaGrid}>
        <div className="ns-card" style={{ ...S.gpaHero, border: '1px solid rgba(75,110,255,0.25)', background: 'rgba(75,110,255,0.05)' }}>
          <p style={S.gpaLabel}>Weighted GPA</p>
          <p style={{ ...S.gpaValue, color: '#4B6EFF' }}>{data?.weightedGPA ?? '—'}</p>
        </div>
        <div className="ns-card" style={{ ...S.gpaHero, border: '1px solid rgba(0,200,150,0.25)', background: 'rgba(0,200,150,0.05)' }}>
          <p style={S.gpaLabel}>Unweighted GPA</p>
          <p style={{ ...S.gpaValue, color: '#00C896' }}>{data?.unweightedGPA ?? '—'}</p>
        </div>
        <div className="ns-card" style={{ ...S.gpaHero, border: '1px solid rgba(255,170,50,0.25)', background: 'rgba(255,170,50,0.05)' }}>
          <p style={S.gpaLabel}>Class Rank</p>
          <p style={{ ...S.gpaValue, fontSize: 36, color: '#FFAA32' }}>{data?.classRank ?? '—'}</p>
        </div>
        <div className="ns-card" style={{ ...S.gpaHero, border: '1px solid rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.05)' }}>
          <p style={S.gpaLabel}>Quartile</p>
          <p style={{ ...S.gpaValue, color: '#A855F7' }}>
            {data?.quartile ? `${data.quartile}${getOrdinalSuffix(data.quartile)}` : '—'}
          </p>
        </div>
      </div>

      {/* Semester tables */}
      {(data?.semesters ?? []).length === 0 && !error && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No transcript data available. Connect your school portal in Settings.
        </p>
      )}

      {(data?.semesters ?? []).map((sem, i) => (
        <div key={i} className="ns-card" style={S.semCard}>
          <p style={S.semTitle}>{sem.year || 'N/A'} — Semester {sem.semester || String(i + 1)}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr>
                <th style={S.th}>Course #</th>
                <th style={S.th}>Course Name</th>
                <th style={S.th}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {sem.courses.map((c, j) => {
                // Split "COURSE CODE — COURSE NAME" back for display
                const sep = c.name.indexOf(' — ')
                const code = sep >= 0 ? c.name.slice(0, sep) : ''
                const name = sep >= 0 ? c.name.slice(sep + 3) : c.name
                return (
                  <tr key={j} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{code}</td>
                    <td style={S.td}>{name}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{c.grade || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function getOrdinalSuffix(n: string): string {
  const num = parseInt(n, 10)
  if (isNaN(num)) return ''
  if (num === 1) return 'st'
  if (num === 2) return 'nd'
  if (num === 3) return 'rd'
  return 'th'
}

const S: Record<string, React.CSSProperties> = {
  back:       { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:      { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 20 },
  errorBanner:{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
  gpaGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 },
  gpaHero:    { padding: '20px 22px', borderRadius: 10 },
  gpaLabel:   { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 6 },
  gpaValue:   { fontSize: 40, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1 },
  semCard:    { padding: '18px 20px', marginBottom: 14 },
  semTitle:   { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 },
  th:         { textAlign: 'left' as const, padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  td:         { padding: '10px 10px', fontSize: 13.5, color: 'var(--text)' },
}