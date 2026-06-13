'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../lib/api'

interface ReportCardCourse {
  name: string
  period: string
  numericGrade: string
  letterGrade: string
  credits: string
  teacher: string
}

interface ReportCardData {
  reportingPeriods: string[]
  currentPeriod: string
  courses: ReportCardCourse[]
}

const GRADE_COLOR: Record<string, string> = { A: '#22C55E', B: '#10B981', C: '#F59E0B', D: '#F97316', F: '#EF4444' }
const letterColor = (l: string) => {
  if (!l) return 'var(--text-muted)'
  return GRADE_COLOR[l.toUpperCase().charAt(0)] ?? 'var(--text-muted)'
}

export default function ReportCardPage() {
  const router = useRouter()
  const [data, setData] = useState<ReportCardData | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.portalReportCard()
      .then(json => {
        setData(json)
        setSelectedPeriod(json.currentPeriod ?? json.reportingPeriods?.[0] ?? '')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load report card'))
      .finally(() => setLoading(false))
  }, [])

  function handlePeriodChange(period: string) {
    setSelectedPeriod(period)
    setPeriodLoading(true)
    api.portalReportCard(period)
      .then(json => {
        setData(prev => prev
          ? { ...prev, courses: json.courses ?? [], currentPeriod: period }
          : json)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setPeriodLoading(false))
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading report card…</div>

  return (
    <div className="fade-up">
      <button onClick={() => router.push('/grades')} style={S.back}>← Grade Portal</button>
      <h1 style={S.title}>Report Card</h1>

      {error && (
        <div style={S.errorBanner}>
          {error}
          {error.toLowerCase().includes('session') && (
            <span> — <a href="/settings" style={{ color: 'var(--warning)', textDecoration: 'underline' }}>reconnect in Settings</a></span>
          )}
        </div>
      )}

      {data && (
        <>
          {data.reportingPeriods && data.reportingPeriods.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Reporting Period</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                {data.reportingPeriods.map(p => (
                  <button
                    key={p}
                    onClick={() => handlePeriodChange(p)}
                    style={{
                      padding: '7px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                      border: selectedPeriod === p ? 'none' : '1px solid var(--border)',
                      background: selectedPeriod === p ? 'var(--primary)' : 'var(--surface)',
                      color: selectedPeriod === p ? '#000' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {periodLoading && (
            <div style={{ height: 160, background: 'rgba(255,255,255,0.04)', borderRadius: 10, marginBottom: 12 }} />
          )}

          {!periodLoading && (
            <div className="ns-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                <thead>
                  <tr>
                    <th style={S.th}>Course</th>
                    <th style={{ ...S.th, textAlign: 'center' as const }}>Per.</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>Grade</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>Letter</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.courses ?? []).map((c, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={S.td}>
                        <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 500 }}>{c.name}</div>
                        {c.teacher && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{c.teacher}</div>}
                      </td>
                      <td style={{ ...S.td, textAlign: 'center' as const, color: 'var(--text-secondary)' }}>{c.period || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right' as const, fontWeight: 700 }}>{c.numericGrade || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right' as const, fontWeight: 700, fontSize: 15, color: letterColor(c.letterGrade) }}>{c.letterGrade || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right' as const, color: 'var(--text-secondary)' }}>{c.credits || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!data.courses || data.courses.length === 0) && (
                <p style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' as const }}>No report card data for this period.</p>
              )}
            </div>
          )}
        </>
      )}

      {!data && !error && !loading && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No report card data. Connect your school portal in Settings.</p>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  back:        { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:       { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 20 },
  errorBanner: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
  th:          { textAlign: 'left' as const, padding: '14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--text-muted)' },
  td:          { padding: '12px 14px', fontSize: 13.5 },
}
