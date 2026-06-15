'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const BASE = ''

interface AttendanceDay {
  date: string
  dayOfWeek: string
  status: string
  code: string
  description: string
}

interface AttendanceData {
  month: string
  year: number
  monthIndex: number
  days: AttendanceDay[]
  summary: { absences: number; tardies: number; excused: number }
}

function apiFetch<T>(path: string): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ns_token') : null
  return fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(r => r.json())
}

const CODE_STYLE: Record<string, React.CSSProperties> = {
  A: { background: 'rgba(239,68,68,0.18)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' },
  T: { background: 'rgba(245,158,11,0.18)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.3)' },
  E: { background: 'rgba(59,130,246,0.18)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.3)' },
}

export default function AttendancePage() {
  const router = useRouter()
  const [data, setData] = useState<AttendanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthOffset, setMonthOffset] = useState(0)

  const fetchAttendance = useCallback((offset: number) => {
    setLoading(true)
    apiFetch<{ data?: AttendanceData; error?: { message?: string } | string }>(
      `/api/integrations/grades/attendance?monthOffset=${offset}`
    )
      .then(json => {
        if (json.error) {
          const msg = typeof json.error === 'string' ? json.error : (json.error?.message ?? 'Failed to load')
          setError(msg); return
        }
        setData(json.data ?? null)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load attendance'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAttendance(0) }, [fetchAttendance])

  // Build 7-column calendar grid from days array
  function buildGrid(): (AttendanceDay | null)[][] {
    if (!data?.days?.length) return []
    const grid: (AttendanceDay | null)[][] = []
    let week: (AttendanceDay | null)[] = []

    // Align first day with correct day-of-week
    if (data.days[0]) {
      const d = new Date(data.days[0].date + 'T12:00:00')
      const dow = d.getDay()
      for (let p = 0; p < dow; p++) week.push(null)
    }

    for (const day of data.days) {
      week.push(day)
      if (week.length === 7) { grid.push(week); week = [] }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null)
      grid.push(week)
    }
    return grid
  }

  const grid = buildGrid()

  function navigate(dir: -1 | 1) {
    const next = monthOffset + dir
    setMonthOffset(next)
    fetchAttendance(next)
  }

  return (
    <div className="fade-up">
      <button onClick={() => router.push('/grades')} style={S.back}>← Grade Portal</button>
      <h1 style={S.title}>Attendance</h1>

      {error && (
        <div style={S.errorBanner}>
          {error}
          {error.toLowerCase().includes('session') && (
            <span> — <a href="/settings" style={{ color: 'var(--warning)', textDecoration: 'underline' }}>reconnect in Settings</a></span>
          )}
        </div>
      )}

      {/* Summary cards */}
      {data?.summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          <div className="ns-card" style={{ padding: '14px 10px', textAlign: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#F87171' }}>{data.summary.absences}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Absences</div>
          </div>
          <div className="ns-card" style={{ padding: '14px 10px', textAlign: 'center', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#FBBF24' }}>{data.summary.tardies}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Tardies</div>
          </div>
          <div className="ns-card" style={{ padding: '14px 10px', textAlign: 'center', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#60A5FA' }}>{data.summary.excused}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Excused</div>
          </div>
        </div>
      )}

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => navigate(-1)} style={S.navBtn}>← Prev</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{data?.month ?? '—'}</span>
        <button onClick={() => navigate(1)} disabled={monthOffset >= 0} style={{ ...S.navBtn, opacity: monthOffset >= 0 ? 0.3 : 1 }}>Next →</button>
      </div>

      {loading && <div style={{ height: 240, background: 'rgba(255,255,255,0.04)', borderRadius: 12 }} />}

      {!loading && data && (
        <>
          {/* Calendar */}
          <div className="ns-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{d}</div>
              ))}
            </div>
            {/* Weeks */}
            {grid.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {week.map((day, di) => {
                  const codeStyle = day?.code ? CODE_STYLE[day.code] : undefined
                  return (
                    <div key={di} title={day?.description || undefined} style={{
                      aspectRatio: '1',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      borderRight: di < 6 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      ...(codeStyle ?? {}),
                    }}>
                      {day && (
                        <>
                          <span style={{ fontWeight: 500, color: codeStyle ? 'inherit' : 'var(--text-secondary)' }}>
                            {new Date(day.date + 'T12:00:00').getDate()}
                          </span>
                          {day.code && day.code !== 'P' && (
                            <span style={{ fontSize: 10, fontWeight: 700, marginTop: 1 }}>{day.code}</span>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            {grid.length === 0 && (
              <p style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                No attendance data. Open <code>debug_attendance.html</code> to inspect the page structure.
              </p>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { code: 'A', label: 'Absent',  style: CODE_STYLE.A },
              { code: 'T', label: 'Tardy',   style: CODE_STYLE.T },
              { code: 'E', label: 'Excused', style: CODE_STYLE.E },
              { code: 'P', label: 'Present', style: { background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--border)' } },
            ].map(item => (
              <div key={item.code} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, fontSize: 12, ...item.style }}>
                <span style={{ fontWeight: 700 }}>{item.code}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  back:        { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:       { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 20 },
  errorBanner: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
  navBtn:      { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '7px 14px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer' },
}
