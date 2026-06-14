'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../lib/api'

interface RCCourse {
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
  semesters: { sem1: RCCourse[]; sem2: RCCourse[] }
}

const GRADE_COLOR: Record<string, string> = { A: '#22C55E', B: '#10B981', C: '#F59E0B', D: '#F97316', F: '#EF4444' }
const letterColor = (l: string) => GRADE_COLOR[l?.toUpperCase().charAt(0)] ?? 'var(--text-muted)'


function CourseTable({ courses, empty }: { courses: RCCourse[]; empty: string }) {
  if (!courses.length) {
    return <p style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' as const }}>{empty}</p>
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
      <thead>
        <tr>
          <th style={S.th}>Course</th>
          <th style={{ ...S.th, textAlign: 'center' as const }}>Per.</th>
          <th style={{ ...S.th }}>Teacher</th>
          <th style={{ ...S.th, textAlign: 'right' as const }}>Grade</th>
        </tr>
      </thead>
      <tbody>
        {courses.map((c, i) => {
          const sep  = c.name.indexOf(' — ')
          const code = sep >= 0 ? c.name.slice(0, sep) : ''
          const name = sep >= 0 ? c.name.slice(sep + 3) : c.name
          return (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={S.td}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{name}</div>
                {code && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{code}</div>}
              </td>
              <td style={{ ...S.td, textAlign: 'center' as const, color: 'var(--text-secondary)' }}>{c.period || '—'}</td>
              <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12 }}>{c.teacher || '—'}</td>
              <td style={{ ...S.td, textAlign: 'right' as const, fontWeight: 700 }}>
                {c.letterGrade
                  ? <span style={{ color: letterColor(c.letterGrade) }}>{c.letterGrade}</span>
                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                {c.numericGrade && (
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 5, fontWeight: 400, fontSize: 12 }}>
                    {c.numericGrade}%
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function ReportCardPage() {
  const router = useRouter()
  const [data, setData]     = useState<ReportCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [active, setActive] = useState<'sem1' | 'sem2'>('sem1')

  useEffect(() => {
    api.portalReportCard()
      .then(json => {
        setData(json)
        // Default to whichever semester has data; prefer sem2 if populated
        if (json.semesters.sem2.some(c => c.numericGrade)) setActive('sem2')
        else setActive('sem1')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load report card'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading report card…</div>

  const sem1 = data?.semesters.sem1 ?? []
  const sem2 = data?.semesters.sem2 ?? []
  const activeCourses = active === 'sem1' ? sem1 : sem2

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
          {/* Semester toggle */}
          <div style={S.toggleRow}>
            {(['sem1', 'sem2'] as const).map(sem => {
              const label   = sem === 'sem1' ? '1st Semester' : '2nd Semester'
              const courses = sem === 'sem1' ? sem1 : sem2
              const isActive = active === sem
              return (
                <button
                  key={sem}
                  onClick={() => setActive(sem)}
                  style={{
                    ...S.semBtn,
                    background: isActive ? 'var(--primary)' : 'var(--surface)',
                    border: isActive ? 'none' : '1px solid var(--border)',
                    color: isActive ? '#000' : 'var(--text-secondary)',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
                  {!courses.some(c => c.numericGrade) && courses.length === 0 && (
                    <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 8 }}>Not released</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Active semester card */}
          <div className="ns-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={S.semHeader}>
              <span style={S.semLabel}>{active === 'sem1' ? '1st Semester' : '2nd Semester'}</span>
            </div>
            <CourseTable
              courses={activeCourses}
              empty={
                active === 'sem1'
                  ? 'No 1st semester grades available yet.'
                  : 'No 2nd semester grades available yet.'
              }
            />
          </div>
        </>
      )}

      {!data && !error && !loading && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No report card data. Connect your school portal in Settings.
        </p>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  back:       { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:      { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 20 },
  errorBanner:{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
  toggleRow:  { display: 'flex', gap: 12, marginBottom: 20 },
  semBtn:     { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 20px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' as const },
  semHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' },
  semLabel:   { fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },

  th:         { textAlign: 'left' as const, padding: '12px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--text-muted)' },
  td:         { padding: '11px 14px', fontSize: 13.5 },
}
