'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Official Katy ISD GPA Scale ───────────────────────────────────────────────
// Regular:     A=4.0  B=3.0  C=2.0  F=0.0
// KAP/AP:      A=5.0  B=4.0  C=3.0  F=1.0 (Weighted only)
// Dual Credit: A=4.5  B=3.5  C=2.5  F=0.5 (Weighted only)
// Unweighted:  All courses use Regular scale (A=4.0, B=3.0, C=2.0, F=0.0)
// Grade cutoffs: A≥90  B≥80  C≥70  F<70

type CourseLevel = 'Regular' | 'KAP' | 'AP' | 'Dual Credit'
type GpaType = 'weighted' | 'unweighted'

const GRADE_POINTS: Record<CourseLevel, Record<string, number>> = {
  'Regular':     { A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0.0 },
  'KAP':         { A: 5.0, B: 4.0, C: 3.0, D: 2.0, F: 0.0 },
  'AP':          { A: 5.0, B: 4.0, C: 3.0, D: 2.0, F: 0.0 },
  'Dual Credit': { A: 4.5, B: 3.5, C: 2.5, D: 1.5, F: 0.0 },
}

function avgToLetter(avg: number): string {
  if (avg >= 90) return 'A'
  if (avg >= 80) return 'B'
  if (avg >= 70) return 'C'
  if (avg >= 60) return 'D'
  return 'F'
}

function gradePoints(avg: number, level: CourseLevel, gpaType: GpaType): number {
  const letter = avgToLetter(avg)
  if (gpaType === 'unweighted') return GRADE_POINTS['Regular'][letter] ?? 0
  return GRADE_POINTS[level][letter] ?? 0
}

function detectLevel(courseName: string): CourseLevel {
  const n = courseName.toUpperCase().trim()
  // Transcript stores names as "COURSECODE — DESCRIPTION" (e.g. "A3580300 - 1 — APCSPRIN")
  // Extract just the description part so AP/KAP detection works on the meaningful text
  const desc = n.includes(' — ') ? n.slice(n.lastIndexOf(' — ') + 3) : n
  if (/^AP/.test(desc)) return 'AP'
  if (/^KAP/.test(desc)) return 'KAP'
  if (/^DUAL|^DC\b/.test(desc)) return 'Dual Credit'
  return 'Regular'
}

interface TranscriptCourse {
  name: string
  grade: string   // numeric grade like "97"
  credits: string
}


interface SimCourse {
  id: string
  name: string
  level: CourseLevel
  average: number  // grade percentage
}

const LETTER_COLORS: Record<string, string> = {
  A: '#22C55E', B: '#10B981', C: '#F59E0B', F: '#EF4444',
}
const letterColor = (avg: number) => LETTER_COLORS[avgToLetter(avg)] ?? 'var(--text-muted)'

const LEVEL_COLORS: Record<CourseLevel, { bg: string; color: string; border: string }> = {
  'AP':          { bg: 'rgba(167,139,250,0.15)', color: '#A78BFA', border: 'rgba(167,139,250,0.3)' },
  'KAP':         { bg: 'rgba(96,165,250,0.15)',  color: '#60A5FA', border: 'rgba(96,165,250,0.3)'  },
  'Dual Credit': { bg: 'rgba(52,211,153,0.15)',  color: '#34D399', border: 'rgba(52,211,153,0.3)'  },
  'Regular':     { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: 'var(--border)' },
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ns_token') : null
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return (await res.json()).data as T
}

export default function WhatIfGpaPage() {
  const router = useRouter()
  const [currentClasses, setCurrentClasses] = useState<TranscriptCourse[]>([])
  const [simCourses, setSimCourses]         = useState<SimCourse[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [gpaType, setGpaType]               = useState<GpaType>('weighted')
  const [simSemesters, setSimSemesters]     = useState(1)

  // Exact GPAs from HAC (same source as dashboard)
  const [exactWeightedGpa, setExactWeightedGpa]     = useState<number | null>(null)
  const [exactUnweightedGpa, setExactUnweightedGpa] = useState<number | null>(null)
  const [courseCount, setCourseCount]               = useState(0)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // 1. Fetch exact GPAs from the portal (what HAC calculates, not recomputed)
        const gpaJson = await apiFetch<{
          unweightedGpa: number | null
          weightedGpa: number | null
          courseCount: number
        }>('/api/integrations/grades/gpa')

        if (gpaJson.unweightedGpa === null && gpaJson.weightedGpa === null) {
          setError('No GPA data found. Connect your school portal in Settings.')
          setLoading(false)
          return
        }

        setExactWeightedGpa(gpaJson.weightedGpa)
        setExactUnweightedGpa(gpaJson.unweightedGpa)
        setCourseCount(gpaJson.courseCount)

        // 2. Fetch current classes for the reference panel
        const classworkRes = await fetch('/api/integrations/grades/classwork', {
          headers: { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('ns_token') : null}` },
        })
        const classworkJson = await classworkRes.json()
        const raw = classworkJson.data?.classes ?? []
        setCurrentClasses(raw.map((c: { name: string; average: string | null }) => ({
          name: c.name ?? '',
          grade: c.average ?? '0',
          credits: '0.5',
        })))

        setSimCourses(generateBlankCourses(7))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  function generateBlankCourses(count: number): SimCourse[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `sim-${i}`,
      name: `New Course ${i + 1}`,
      level: 'Regular' as CourseLevel,
      average: 0,
    }))
  }

  function handleSemesterChange(n: number) {
    const count = n * 7
    setSimSemesters(n)
    setSimCourses(prev => {
      if (prev.length === count) return prev
      return Array.from({ length: count }, (_, i) => prev[i] ?? {
        id: `sim-${i}`,
        name: `New Course ${i + 1}`,
        level: 'Regular' as CourseLevel,
        average: 0,
      })
    })
  }

  // Project simulated GPA by starting from the exact HAC GPA × courseCount,
  // then adding the simulated courses' grade points on top.
  function calcSimulatedGpa(type: GpaType): number {
    const base = type === 'weighted' ? exactWeightedGpa : exactUnweightedGpa
    if (base === null || courseCount === 0) return 0

    let simPts = 0
    let simCount = 0
    for (const c of simCourses) {
      if (c.average > 0) {
        simPts += gradePoints(c.average, c.level, type)
        simCount++
      }
    }
    if (simCount === 0) return base

    const totalPts = base * courseCount + simPts
    return Math.round((totalPts / (courseCount + simCount)) * 1000) / 1000
  }

  const baselineGpa = (gpaType === 'weighted' ? exactWeightedGpa : exactUnweightedGpa) ?? 0
  const simGPA      = calcSimulatedGpa(gpaType)
  const delta       = simGPA - baselineGpa
  const hasSimCourses = simCourses.some(c => c.average > 0)

  const updateSimCourse = (id: string, field: 'average' | 'level', value: string) =>
    setSimCourses(prev => prev.map(c => c.id === id ? {
      ...c,
      [field]: field === 'average' ? (parseFloat(value) || 0) : (value as CourseLevel),
    } : c))

  const clearAll = () => setSimCourses(prev => prev.map(c => ({ ...c, average: 0 })))

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading data…</div>

  return (
    <div className="fade-up">
      <button onClick={() => router.push('/grades')} style={S.back}>← Grade Portal</button>
      <h1 style={S.title}>GPA What-If Calculator</h1>

      {/* GPA type toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setGpaType('weighted')}
          style={{
            ...S.toggleBtn,
            background: gpaType === 'weighted' ? 'var(--primary)' : 'var(--surface)',
            color: gpaType === 'weighted' ? '#fff' : 'var(--text-secondary)',
            borderColor: gpaType === 'weighted' ? 'var(--primary)' : 'var(--border)',
          }}>Weighted</button>
        <button onClick={() => setGpaType('unweighted')}
          style={{
            ...S.toggleBtn,
            background: gpaType === 'unweighted' ? '#00C896' : 'var(--surface)',
            color: gpaType === 'unweighted' ? '#fff' : 'var(--text-secondary)',
            borderColor: gpaType === 'unweighted' ? '#00C896' : 'var(--border)',
          }}>Unweighted</button>
      </div>

      {error && (
        <div style={S.errorBanner}>
          {error}
          {error.toLowerCase().includes('session') && (
            <span> — <a href="/settings" style={{ color: 'var(--warning)', textDecoration: 'underline' }}>reconnect in Settings</a></span>
          )}
        </div>
      )}

      {/* GPA cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div className="ns-card" style={{ flex: 1, padding: 20 }}>
          <div style={S.gpaLabel}>Current {gpaType === 'weighted' ? 'Weighted' : 'Unweighted'} GPA</div>
          <div style={{ ...S.gpaNum, marginTop: 8 }}>{baselineGpa.toFixed(3)}</div>
          <div style={S.gpaNote}>
            {courseCount} courses from transcript
          </div>
        </div>
        <div className="ns-card" style={{ flex: 1, padding: 20, borderColor: hasSimCourses ? 'rgba(0,200,150,0.3)' : 'var(--border)', background: hasSimCourses ? 'rgba(0,200,150,0.04)' : undefined }}>
          <div style={S.gpaLabel}>Simulated {gpaType === 'weighted' ? 'Weighted' : 'Unweighted'} GPA</div>
          <div style={{ ...S.gpaNum, marginTop: 8, color: hasSimCourses ? 'var(--primary)' : 'var(--text-muted)' }}>{simGPA.toFixed(3)}</div>
          {hasSimCourses && (
            <div style={{ fontSize: 13, fontWeight: 700, color: delta >= 0 ? '#22C55E' : '#EF4444', marginTop: 4 }}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(3)}
            </div>
          )}
        </div>
      </div>

      <p style={S.sub}>
        {gpaType === 'weighted'
          ? 'Official Katy ISD weighted scale: AP/KAP=5.0, Dual=4.5, Regular=4.0'
          : 'Unweighted scale: All courses use Regular scale (A=4.0, B=3.0, C=2.0, F=0.0)'}
      </p>

      {/* Semester selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={S.sectionLabel}>Simulate additional courses</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => handleSemesterChange(1)}
            style={{ ...S.semBtn, background: simSemesters === 1 ? 'var(--primary)' : 'var(--surface)', color: simSemesters === 1 ? '#fff' : 'var(--text-secondary)', borderColor: simSemesters === 1 ? 'var(--primary)' : 'var(--border)' }}>
            1 Semester (7 courses)
          </button>
          <button onClick={() => handleSemesterChange(2)}
            style={{ ...S.semBtn, background: simSemesters === 2 ? 'var(--primary)' : 'var(--surface)', color: simSemesters === 2 ? '#fff' : 'var(--text-secondary)', borderColor: simSemesters === 2 ? 'var(--primary)' : 'var(--border)' }}>
            1 Year (14 courses)
          </button>
          <button onClick={() => handleSemesterChange(4)}
            style={{ ...S.semBtn, background: simSemesters === 4 ? 'var(--primary)' : 'var(--surface)', color: simSemesters === 4 ? '#fff' : 'var(--text-secondary)', borderColor: simSemesters === 4 ? 'var(--primary)' : 'var(--border)' }}>
            2 Years (28 courses)
          </button>
        </div>
      </div>

      {hasSimCourses && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={clearAll} style={S.clearBtn}>Clear all</button>
        </div>
      )}

      {/* Simulated course rows */}
      {simCourses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {simCourses.map(c => {
            const effectiveLetter = c.average > 0 ? avgToLetter(c.average) : '—'
            const effectivePts = c.average > 0 ? gradePoints(c.average, c.level, gpaType) : 0
            const isFilled = c.average > 0
            const levelStyle = LEVEL_COLORS[c.level]

            return (
              <div key={c.id} className="ns-card"
                style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10,
                  borderColor: isFilled ? 'rgba(0,200,150,0.3)' : 'var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {c.name}
                  </span>
                </div>

                {/* Level selector (weighted only) */}
                {gpaType === 'weighted' && (
                  <select value={c.level} onChange={e => updateSimCourse(c.id, 'level', e.target.value)}
                    style={{ background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 11,
                      border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', outline: 'none', cursor: 'pointer' }}>
                    <option>Regular</option>
                    <option>KAP</option>
                    <option>AP</option>
                    <option>Dual Credit</option>
                  </select>
                )}

                <input type="number" min="0" max="100"
                  value={c.average > 0 ? c.average : ''}
                  onChange={e => updateSimCourse(c.id, 'average', e.target.value)}
                  placeholder="Avg %"
                  className="ns-input"
                  style={{ width: 70, height: 32, textAlign: 'right' as const, fontSize: 12,
                    borderColor: isFilled ? 'var(--primary)' : undefined }} />

                <div style={{ width: 36, textAlign: 'center' as const, flexShrink: 0, opacity: isFilled ? 1 : 0.3 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: isFilled ? letterColor(c.average) : 'var(--text-muted)' }}>{effectiveLetter}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{isFilled ? `${effectivePts.toFixed(1)}` : 'pts'}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Current classes for reference */}
      {currentClasses.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={S.sectionLabel}>Your current classes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {currentClasses.map((c, i) => {
              const avg = parseFloat(c.grade)
              const level = detectLevel(c.name)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <span>{c.name}</span>
                  <span>
                    {!isNaN(avg) && avg > 0
                      ? `${avg.toFixed(1)}% → ${gradePoints(avg, level, gpaType).toFixed(1)} pts`
                      : 'N/A'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' as const, marginTop: 20, lineHeight: 1.5 }}>
        {gpaType === 'weighted'
          ? 'Set the course type and enter a grade (0–100) to simulate new courses.'
          : 'Enter a grade (0–100) to simulate new courses. Unweighted uses Regular scale for all types.'}
      </p>

      {!loading && !error && courseCount === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No GPA data available. Connect your portal in Settings.
        </p>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  back:        { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:       { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 20 },
  sub:         { fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16 },
  errorBanner: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
  sectionLabel:{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: 'var(--text-muted)' },
  toggleBtn:   { height: 34, padding: '0 20px', borderRadius: 8, border: '1px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  semBtn:      { height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' },
  gpaLabel:    { fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: 'var(--text-muted)' },
  gpaNum:      { fontSize: 36, fontWeight: 800, letterSpacing: '-1px', color: 'var(--text)', lineHeight: 1 },
  gpaNote:     { fontSize: 11, color: 'var(--text-muted)', marginTop: 6 },
  clearBtn:    { background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '6px 14px' },
}