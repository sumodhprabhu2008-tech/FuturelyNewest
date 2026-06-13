'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../lib/api'

interface IPRCourse {
  name: string
  period: string
  average: string
  letterGrade: string
  teacher: string
}

interface IPRData {
  availableDates: string[]
  currentDate: string
  courses: IPRCourse[]
}

function avgColor(avg: string): string {
  const n = parseFloat(avg)
  if (isNaN(n)) return 'var(--text-muted)'
  if (n >= 90) return '#22C55E'
  if (n >= 80) return '#10B981'
  if (n >= 70) return '#F59E0B'
  return '#EF4444'
}

export default function ProgressReportPage() {
  const router = useRouter()
  const [data, setData] = useState<IPRData | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [dateLoading, setDateLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.portalProgressReport()
      .then(json => {
        setData(json)
        setSelectedDate(json.currentDate ?? json.availableDates?.[0] ?? '')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load progress report'))
      .finally(() => setLoading(false))
  }, [])

  function handleDateChange(date: string) {
    setSelectedDate(date)
    setDateLoading(true)
    api.portalProgressReport(date)
      .then(json => {
        setData(prev => prev
          ? { ...prev, courses: json.courses ?? [], currentDate: date }
          : json)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setDateLoading(false))
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading progress report…</div>

  return (
    <div className="fade-up">
      <button onClick={() => router.push('/grades')} style={S.back}>← Grade Portal</button>
      <h1 style={S.title}>Progress Report</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Interim grades posted throughout the semester</p>

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
          {data.availableDates && data.availableDates.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Report Date</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {data.availableDates.map(date => (
                  <button
                    key={date}
                    onClick={() => handleDateChange(date)}
                    style={{
                      flexShrink: 0, padding: '8px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                      border: selectedDate === date ? 'none' : '1px solid var(--border)',
                      background: selectedDate === date ? 'var(--primary)' : 'var(--surface)',
                      color: selectedDate === date ? '#000' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {date}
                  </button>
                ))}
              </div>
            </div>
          )}

          {dateLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 64, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }} />)}
            </div>
          )}

          {!dateLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.courses ?? []).map((c, i) => (
                <div key={i} className="ns-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                      {c.period ? `P${c.period} — ` : ''}{c.name}
                    </div>
                    {c.teacher && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{c.teacher}</div>}
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: avgColor(c.average) }}>{c.average || '—'}</div>
                    {c.letterGrade && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{c.letterGrade}</div>}
                  </div>
                </div>
              ))}
              {(!data.courses || data.courses.length === 0) && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No progress report data for this date.</p>
              )}
            </div>
          )}
        </>
      )}

      {!data && !error && !loading && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No progress report data. Connect your school portal in Settings.</p>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  back:        { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:       { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 },
  errorBanner: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
}
