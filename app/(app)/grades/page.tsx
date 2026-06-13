'use client'

import { useEffect, useState } from 'react'
import { api, type StudentData, type NormalizedCourse } from '../../../lib/api'

type SortKey = 'name' | 'teacher' | 'period' | 'grade' | 'percentage'
type SortDir = 'asc' | 'desc'

const GRADE_COLORS: Record<string, string> = {
  A: '#3FB950', B: '#00C896', C: '#D29922', D: '#F0883E', F: '#F85149',
}

function gradeColor(letter: string | null) {
  if (!letter) return 'var(--text-muted)'
  return GRADE_COLORS[letter.charAt(0).toUpperCase()] ?? 'var(--text-muted)'
}

// Unified shape for the table — works for both seeded and live data
interface DisplayCourse {
  id: string | number
  name: string
  teacher: string
  period: string
  courseType: string
  letterGrade: string | null
  percentage: number | null
}

export default function GradesPage() {
  const [seedData, setSeedData]       = useState<StudentData | null>(null)
  const [liveGrades, setLiveGrades]   = useState<NormalizedCourse[] | null>(null)
  const [districtUrl, setDistrictUrl] = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [sortKey, setSortKey]         = useState<SortKey>('period')
  const [sortDir, setSortDir]         = useState<SortDir>('asc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [expandedTab, setExpandedTab] = useState<Record<string, 'graded' | 'upcoming'>>({})
  const [portalConnected, setPortalConnected] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    // Always load seeded data first as fallback
    const seedLoad = api.me()
      .then(setSeedData)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load data'))

    // Check if portal is connected and load live grades
    const liveLoad = api.portalStatus()
      .then(status => {
        if (!status.connected) return
        setPortalConnected(true)
        setDistrictUrl(status.districtUrl)
        return api.portalGrades()
          .then(result => {
            if (result.grades && result.grades.length > 0) {
              setLiveGrades(result.grades)
            }
          })
          .catch(e => {
            // Non-fatal: log but fall back to seeded data
            console.warn('[GRADES] Live grade fetch failed:', e)
            setSessionExpired(true)
          })
      })
      .catch(() => null) // Portal status check failed — not connected, use seeded

    Promise.all([seedLoad, liveLoad]).finally(() => setLoading(false))
  }, [])

  function toggleExpanded(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)', padding: '32px' }}>Loading grades...</p>
  if (error)   return <p style={{ color: 'var(--error)', padding: '32px' }}>{error}</p>

  // Build unified display courses from whichever data source is active
  const usingLive = liveGrades !== null && liveGrades.length > 0

  const displayCourses: DisplayCourse[] = usingLive
    ? liveGrades!.map(c => ({
        id: c.id,
        name: c.name,
        teacher: c.teacher || '—',
        period: c.period || '—',
        courseType: 'LIVE',
        letterGrade: c.letterGrade,
        percentage: c.average,
      }))
    : (seedData?.courses ?? []).map(c => ({
        id: c.id,
        name: c.name,
        teacher: c.teacher,
        period: String(c.period),
        courseType: c.courseType,
        letterGrade: c.grade?.letterGrade ?? null,
        percentage: c.grade?.percentage ?? null,
      }))

  // Compute GPA
  let uGpa = '—'
  let wGpa = '—'
  if (usingLive) {
    const vals = liveGrades!
      .map(c => c.average)
      .filter((v): v is number => v !== null)
    if (vals.length > 0) {
      const numericAvg = vals.reduce((a, b) => a + b, 0) / vals.length
      const gpaVal = numericAvg >= 90 ? 4.0
        : numericAvg >= 80 ? 3.0
        : numericAvg >= 70 ? 2.0
        : numericAvg >= 60 ? 1.0 : 0.0
      uGpa = gpaVal.toFixed(2)
      wGpa = gpaVal.toFixed(2)
    }
  } else {
    uGpa = (seedData?.profile?.unweightedGpa ?? 0).toFixed(2)
    wGpa = (seedData?.profile?.weightedGpa ?? 0).toFixed(2)
  }

  const totalCourses = displayCourses.length

  // Sort
  const sorted = [...displayCourses].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (sortKey === 'name')            { va = a.name;              vb = b.name }
    else if (sortKey === 'teacher')    { va = a.teacher;           vb = b.teacher }
    else if (sortKey === 'period')     { va = a.period;            vb = b.period }
    else if (sortKey === 'grade')      { va = a.letterGrade ?? 'Z'; vb = b.letterGrade ?? 'Z' }
    else if (sortKey === 'percentage') { va = a.percentage ?? -1;  vb = b.percentage ?? -1 }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <th
        style={{ ...styles.th, cursor: 'pointer', color: active ? 'var(--primary)' : 'var(--text-secondary)' }}
        onClick={() => handleSort(k)}
      >
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
      </th>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px' }}>Grades</h1>

      {/* Data source banner */}
      {usingLive ? (
        <div style={styles.liveBanner}>
          ✓ Showing live grades from {districtUrl ?? 'your school portal'}
        </div>
      ) : portalConnected && sessionExpired ? (
        <div style={styles.demoBanner}>
          ⚠ Session expired —{' '}
          <a href="/settings" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            reconnect your school portal in Settings
          </a>
        </div>
      ) : (
        <div style={styles.demoBanner}>
          Showing demo data —{' '}
          <a href="/settings" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            connect your school portal in Settings
          </a>
        </div>
      )}

      {/* GPA summary */}
      <div style={{ ...styles.card, display: 'flex', gap: '32px', marginBottom: '24px' }}>
        <div>
          <div style={styles.gpaLabel}>Unweighted GPA</div>
          <div style={{ fontSize: '32px', fontWeight: '700' }}>{uGpa}</div>
        </div>
        <div style={styles.divider} />
        <div>
          <div style={styles.gpaLabel}>Weighted GPA</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--primary)' }}>{wGpa}</div>
        </div>
        <div style={styles.divider} />
        <div>
          <div style={styles.gpaLabel}>Total Courses</div>
          <div style={{ fontSize: '32px', fontWeight: '700' }}>{totalCourses}</div>
        </div>
      </div>

      {/* Grades table */}
      <div style={styles.card}>
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '32px' }}>
            {usingLive
              ? 'Connected to your school portal, but no grades were returned yet. Try refreshing.'
              : 'No courses found.'}
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHead}>
                <SortBtn k="name" label="Course" />
                <SortBtn k="teacher" label="Teacher" />
                <SortBtn k="period" label="Period" />
                <th style={styles.th}>Type</th>
                <SortBtn k="grade" label="Grade" />
                <SortBtn k="percentage" label="%" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const liveData = usingLive
                  ? liveGrades!.find(g => g.id === c.id) ?? null
                  : null
                const isExpanded = expandedRows.has(String(c.id))
                return [
                  <tr
                    key={c.id}
                    style={{ ...styles.tableRow, cursor: liveData ? 'pointer' : 'default' }}
                    onClick={() => liveData && toggleExpanded(String(c.id))}
                  >
                    <td style={styles.td}>{c.name}</td>
                    <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{c.teacher}</td>
                    <td style={styles.td}>{c.period}</td>
                    <td style={styles.td}>
                      <span style={{
                        fontSize: '11px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px',
                        background: c.courseType === 'AP' ? 'rgba(88,166,255,0.15)'
                          : c.courseType === 'HONORS' ? 'rgba(188,140,255,0.15)'
                          : c.courseType === 'LIVE' ? 'rgba(0,200,150,0.15)'
                          : 'var(--border)',
                        color: c.courseType === 'AP' ? 'var(--info)'
                          : c.courseType === 'HONORS' ? '#BC8CFF'
                          : c.courseType === 'LIVE' ? 'var(--primary)'
                          : 'var(--text-secondary)',
                      }}>
                        {c.courseType === 'LIVE' ? 'LIVE' : c.courseType}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {c.letterGrade ? (
                        <span style={{ color: gradeColor(c.letterGrade), fontWeight: '700', fontSize: '16px' }}>
                          {c.letterGrade}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>
                      {c.percentage !== null ? `${c.percentage.toFixed(1)}%` : '—'}
                    </td>
                  </tr>,
                  isExpanded && liveData && (
                    <tr key={`${c.id}-expand`}>
                      <td colSpan={6} style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 24px' }}>
                        {/* Tab bar */}
                        <div style={{ display: 'flex', gap: 0, marginBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                          {(['graded', 'upcoming'] as const).map(tab => {
                            const count = tab === 'graded'
                              ? liveData.assignments.length
                              : (liveData.upcomingAssignments ?? []).length
                            const active = (expandedTab[String(c.id)] ?? 'graded') === tab
                            return (
                              <button key={tab} onClick={e => { e.stopPropagation(); setExpandedTab(prev => ({ ...prev, [String(c.id)]: tab })) }}
                                style={{ background: 'none', border: 'none', padding: '8px 16px', fontSize: '13px', fontWeight: active ? 600 : 400,
                                  color: active ? 'var(--primary)' : 'var(--text-secondary)',
                                  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}>
                                {tab === 'graded' ? `Graded (${count})` : `Upcoming (${count})`}
                              </button>
                            )
                          })}
                        </div>

                        {/* Assignment table */}
                        {(() => {
                          const currentTab = expandedTab[String(c.id)] ?? 'graded'
                          const rows = currentTab === 'graded'
                            ? liveData.assignments
                            : (liveData.upcomingAssignments ?? [])
                          if (rows.length === 0) return (
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>
                              {currentTab === 'graded' ? 'No graded assignments yet.' : 'No upcoming assignments.'}
                            </p>
                          )
                          return (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr>
                                  {['Assignment', 'Category', 'Due', currentTab === 'graded' ? 'Score' : 'Status', currentTab === 'graded' ? '%' : ''].filter(Boolean).map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((a, i) => (
                                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px', color: 'var(--text)' }}>{a.name}</td>
                                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{a.category}</td>
                                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{a.dateDue || '—'}</td>
                                    <td style={{ padding: '8px' }}>
                                      {currentTab === 'graded'
                                        ? (a.score !== null && a.totalPoints !== null ? `${a.score}/${a.totalPoints}` : '—')
                                        : <span style={{ fontSize: '11px', color: '#D29922', background: 'rgba(210,153,34,0.1)', borderRadius: 4, padding: '2px 6px' }}>Upcoming</span>
                                      }
                                    </td>
                                    {currentTab === 'graded' && (
                                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{a.percentage || '—'}</td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        })()}
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  liveBanner: {
    background: 'rgba(0,200,150,0.1)', border: '1px solid rgba(0,200,150,0.3)',
    borderRadius: '8px', padding: '10px 16px', marginBottom: '20px',
    color: '#00C896', fontSize: '13px', fontWeight: 500,
  },
  demoBanner: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '10px 16px', marginBottom: '20px',
    color: 'var(--text-secondary)', fontSize: '13px',
  },
  gpaLabel: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' },
  divider: { width: '1px', background: 'var(--border)', alignSelf: 'stretch' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  tableHead: { borderBottom: '1px solid var(--border)' },
  th: { textAlign: 'left' as const, padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' as const },
  tableRow: { borderBottom: '1px solid var(--border)' },
  td: { padding: '12px', fontSize: '14px' },
}
