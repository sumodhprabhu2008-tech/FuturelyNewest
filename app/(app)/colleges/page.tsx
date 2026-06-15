'use client'

import { useEffect, useRef, useState } from 'react'
import { api, type CollegeListItem, type StudentData } from '../../../lib/api'

// ── College dataset ────────────────────────────────────────────────────────────
// avgGPA: middle-50% enrolled student unweighted GPA
// avgSAT: middle-50% enrolled student SAT (combined)
// acceptRate: overall acceptance rate (%)
const COLLEGES = [
  { name: 'MIT',                              avgGPA: 3.96, avgSAT: 1545, acceptRate: 4  },
  { name: 'Harvard University',               avgGPA: 3.92, avgSAT: 1520, acceptRate: 4  },
  { name: 'Stanford University',              avgGPA: 3.96, avgSAT: 1510, acceptRate: 4  },
  { name: 'Princeton University',             avgGPA: 3.91, avgSAT: 1510, acceptRate: 5  },
  { name: 'Yale University',                  avgGPA: 3.95, avgSAT: 1515, acceptRate: 5  },
  { name: 'Columbia University',              avgGPA: 3.91, avgSAT: 1505, acceptRate: 5  },
  { name: 'UChicago',                         avgGPA: 3.90, avgSAT: 1520, acceptRate: 6  },
  { name: 'UPenn',                            avgGPA: 3.90, avgSAT: 1505, acceptRate: 7  },
  { name: 'Dartmouth College',                avgGPA: 3.90, avgSAT: 1490, acceptRate: 8  },
  { name: 'Brown University',                 avgGPA: 3.90, avgSAT: 1500, acceptRate: 6  },
  { name: 'Cornell University',               avgGPA: 3.90, avgSAT: 1480, acceptRate: 11 },
  { name: 'Caltech',                          avgGPA: 3.97, avgSAT: 1560, acceptRate: 4  },
  { name: 'Duke University',                  avgGPA: 3.90, avgSAT: 1510, acceptRate: 8  },
  { name: 'Northwestern University',          avgGPA: 3.92, avgSAT: 1505, acceptRate: 7  },
  { name: 'Johns Hopkins University',         avgGPA: 3.90, avgSAT: 1505, acceptRate: 11 },
  { name: 'Rice University',                  avgGPA: 3.93, avgSAT: 1510, acceptRate: 9  },
  { name: 'Vanderbilt University',            avgGPA: 3.83, avgSAT: 1500, acceptRate: 9  },
  { name: 'Washington University in St. Louis',avgGPA: 3.90, avgSAT: 1505, acceptRate: 15 },
  { name: 'Notre Dame',                       avgGPA: 3.92, avgSAT: 1475, acceptRate: 13 },
  { name: 'Carnegie Mellon',                  avgGPA: 3.83, avgSAT: 1510, acceptRate: 15 },
  { name: 'Georgetown University',            avgGPA: 3.89, avgSAT: 1430, acceptRate: 14 },
  { name: 'Emory University',                 avgGPA: 3.83, avgSAT: 1440, acceptRate: 19 },
  { name: 'Tufts University',                 avgGPA: 3.88, avgSAT: 1465, acceptRate: 12 },
  { name: 'Tulane University',                avgGPA: 3.70, avgSAT: 1420, acceptRate: 13 },
  { name: 'UC Berkeley',                      avgGPA: 3.89, avgSAT: 1415, acceptRate: 17 },
  { name: 'UCLA',                             avgGPA: 3.90, avgSAT: 1390, acceptRate: 14 },
  { name: 'University of Michigan',           avgGPA: 3.88, avgSAT: 1420, acceptRate: 20 },
  { name: 'University of Virginia',           avgGPA: 4.18, avgSAT: 1390, acceptRate: 21 },
  { name: 'Georgia Tech',                     avgGPA: 4.07, avgSAT: 1440, acceptRate: 17 },
  { name: 'USC',                              avgGPA: 3.79, avgSAT: 1400, acceptRate: 16 },
  { name: 'Northeastern University',          avgGPA: 3.88, avgSAT: 1475, acceptRate: 7  },
  { name: 'NYU',                              avgGPA: 3.70, avgSAT: 1380, acceptRate: 21 },
  { name: 'Boston University',                avgGPA: 3.70, avgSAT: 1370, acceptRate: 19 },
  { name: 'Case Western Reserve',             avgGPA: 3.80, avgSAT: 1440, acceptRate: 30 },
  { name: 'UIUC',                             avgGPA: 3.83, avgSAT: 1400, acceptRate: 45 },
  { name: 'SMU',                              avgGPA: 3.60, avgSAT: 1310, acceptRate: 52 },
  { name: 'Baylor University',                avgGPA: 3.71, avgSAT: 1270, acceptRate: 45 },
  { name: 'TCU',                              avgGPA: 3.70, avgSAT: 1250, acceptRate: 41 },
  { name: 'UT Austin',                        avgGPA: 3.74, avgSAT: 1310, acceptRate: 31 },
  { name: 'University of Washington',         avgGPA: 3.80, avgSAT: 1330, acceptRate: 56 },
  { name: 'University of Wisconsin',          avgGPA: 3.83, avgSAT: 1320, acceptRate: 57 },
  { name: 'Texas A&M',                        avgGPA: 3.72, avgSAT: 1240, acceptRate: 57 },
  { name: 'Ohio State University',            avgGPA: 3.73, avgSAT: 1320, acceptRate: 54 },
  { name: 'Penn State',                       avgGPA: 3.59, avgSAT: 1230, acceptRate: 54 },
  { name: 'Purdue University',                avgGPA: 3.67, avgSAT: 1300, acceptRate: 67 },
  { name: 'University of Florida',            avgGPA: 4.10, avgSAT: 1360, acceptRate: 31 },
  { name: 'Florida State University',         avgGPA: 3.80, avgSAT: 1220, acceptRate: 37 },
  { name: 'University of Tennessee',          avgGPA: 3.75, avgSAT: 1230, acceptRate: 70 },
  { name: 'Indiana University',               avgGPA: 3.72, avgSAT: 1250, acceptRate: 80 },
  { name: 'University of Houston',            avgGPA: 3.50, avgSAT: 1190, acceptRate: 66 },
  { name: 'Texas Tech University',            avgGPA: 3.55, avgSAT: 1180, acceptRate: 72 },
  { name: 'University of Colorado',           avgGPA: 3.50, avgSAT: 1240, acceptRate: 84 },
  { name: 'Arizona State University',         avgGPA: 3.50, avgSAT: 1220, acceptRate: 88 },
  { name: 'University of Arizona',            avgGPA: 3.40, avgSAT: 1190, acceptRate: 85 },
  { name: 'University of Oregon',             avgGPA: 3.50, avgSAT: 1200, acceptRate: 83 },
  // Texas UT System
  { name: 'UT Dallas (UTD)',                  avgGPA: 3.82, avgSAT: 1330, acceptRate: 82 },
  { name: 'UT Arlington (UTA)',               avgGPA: 3.40, avgSAT: 1160, acceptRate: 88 },
  { name: 'UT San Antonio (UTSA)',            avgGPA: 3.30, avgSAT: 1110, acceptRate: 91 },
  { name: 'UT El Paso (UTEP)',                avgGPA: 3.10, avgSAT: 1030, acceptRate: 99 },
  { name: 'UT Tyler',                         avgGPA: 3.20, avgSAT: 1100, acceptRate: 95 },
  { name: 'UT Rio Grande Valley (UTRGV)',     avgGPA: 3.10, avgSAT: 1010, acceptRate: 99 },
  // Texas other
  { name: 'Texas State University',           avgGPA: 3.45, avgSAT: 1140, acceptRate: 88 },
  { name: 'University of North Texas (UNT)',  avgGPA: 3.40, avgSAT: 1140, acceptRate: 76 },
  { name: 'Sam Houston State University',     avgGPA: 3.20, avgSAT: 1060, acceptRate: 74 },
  { name: 'Stephen F. Austin (SFA)',          avgGPA: 3.10, avgSAT: 1050, acceptRate: 85 },
  { name: 'Lamar University',                 avgGPA: 3.10, avgSAT: 1020, acceptRate: 95 },
  { name: 'Texas Southern University',        avgGPA: 2.90, avgSAT: 960,  acceptRate: 67 },
  { name: 'Prairie View A&M',                 avgGPA: 3.00, avgSAT: 980,  acceptRate: 68 },
  { name: 'Tarleton State University',        avgGPA: 3.20, avgSAT: 1050, acceptRate: 72 },
  { name: 'Texas A&M - Commerce',             avgGPA: 3.10, avgSAT: 1030, acceptRate: 65 },
  { name: 'Texas A&M - Corpus Christi',       avgGPA: 3.10, avgSAT: 1040, acceptRate: 89 },
  { name: 'Texas A&M - Kingsville',           avgGPA: 3.00, avgSAT: 990,  acceptRate: 79 },
  { name: 'Angelo State University',          avgGPA: 3.10, avgSAT: 1050, acceptRate: 85 },
  { name: 'Midwestern State University',      avgGPA: 3.10, avgSAT: 1040, acceptRate: 79 },
  { name: 'Houston Baptist University',       avgGPA: 3.30, avgSAT: 1100, acceptRate: 74 },
]

// ── Likelihood score ───────────────────────────────────────────────────────────
// Formula: start from the school's acceptance rate as the baseline probability,
// then multiply by an adjustment factor based on how the student's stats compare
// to the school's enrolled-student averages. Being above average boosts the score;
// being below average reduces it. Uses a geometric-mean exponential so that
// a highly selective school (3% accept rate) stays hard even with great stats,
// and an open-access school stays easy even with weak stats.
function calcScore(studentGPA: number | null, studentSAT: number | null, college: typeof COLLEGES[0]): number | null {
  const hasGPA = studentGPA !== null && studentGPA > 0
  const hasSAT = studentSAT !== null && studentSAT > 0
  if (!hasGPA && !hasSAT) return null

  // How far the student's stats deviate from the school's averages, normalised
  // GPA std-dev ≈ 0.4 for enrolled students; SAT std-dev ≈ 120
  let factor = 1.0
  if (hasGPA && hasSAT) {
    const gpaZ = (studentGPA! - college.avgGPA) / 0.4
    const satZ = (studentSAT! - college.avgSAT) / 120
    const z = gpaZ * 0.6 + satZ * 0.4
    factor = Math.exp(z * 0.9)
  } else if (hasGPA) {
    const gpaZ = (studentGPA! - college.avgGPA) / 0.4
    factor = Math.exp(gpaZ * 0.9)
  } else {
    const satZ = (studentSAT! - college.avgSAT) / 120
    factor = Math.exp(satZ * 0.9)
  }

  const raw = college.acceptRate * factor
  return Math.min(98, Math.max(1, Math.round(raw)))
}

function scoreColor(s: number) {
  if (s >= 75) return '#22C55E'
  if (s >= 50) return '#F59E0B'
  if (s >= 25) return '#F97316'
  return '#EF4444'
}

function scoreLabel(s: number) {
  if (s >= 75) return 'Likely'
  if (s >= 50) return 'Possible'
  if (s >= 25) return 'Reach'
  return 'Far Reach'
}

export default function CollegesPage() {
  const [list, setList]           = useState<CollegeListItem[]>([])
  const [profile, setProfile]     = useState<StudentData['profile'] | null>(null)
  const [portalGpa, setPortalGpa] = useState<{ unweightedGpa: number | null; weightedGpa: number | null } | null>(null)
  const [query, setQuery]         = useState('')
  const [adding, setAdding]       = useState<string | null>(null)
  const [removing, setRemoving]   = useState<number | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.collegeList().then(setList).catch(() => {})
    api.me().then(d => setProfile(d.profile)).catch(() => {})
    api.portalGpa().then(d => setPortalGpa({ unweightedGpa: d.unweightedGpa, weightedGpa: d.weightedGpa })).catch(() => {})
  }, [])

  const suggestions = query.trim().length > 0
    ? COLLEGES.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  const addedNames = new Set(list.map(l => l.name))

  async function handleAdd(name: string) {
    if (addedNames.has(name)) return
    setAdding(name)
    try {
      const item = await api.collegeAdd(name)
      setList(prev => [...prev, item])
      setQuery('')
      setShowDropdown(false)
    } catch { /* duplicate or error — ignore */ }
    finally { setAdding(null) }
  }

  async function handleRemove(id: number) {
    setRemoving(id)
    try {
      await api.collegeRemove(id)
      setList(prev => prev.filter(i => i.id !== id))
    } catch { /* ignore */ }
    finally { setRemoving(false as unknown as null) }
  }

  // Prefer live portal GPA over stored profile GPA
  const unweightedGpa = (portalGpa?.unweightedGpa ?? 0) > 0 ? portalGpa!.unweightedGpa : (profile?.unweightedGpa ?? null)
  const weightedGpa   = (portalGpa?.weightedGpa ?? 0) > 0   ? portalGpa!.weightedGpa   : (profile?.weightedGpa   ?? null)
  const studentGPA    = unweightedGpa
  const studentSAT    = profile?.satScore ?? null
  const hasStats      = (studentGPA && studentGPA > 0) || (studentSAT && studentSAT > 0)

  return (
    <div className="fade-up" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>College List</h1>
          <p style={S.sub}>Search and track the colleges you want to get into.</p>
        </div>
      </div>

      {/* Stats context */}
      {!hasStats && (
        <div className="ns-card" style={{ ...S.warnCard }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Add your GPA and SAT score in <a href="/settings" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Settings</a> to see your likelihood scores.</span>
        </div>
      )}
      {hasStats && (
        <div className="ns-card" style={S.statsRow}>
          <div style={S.statChip}>
            <span style={S.statLabel}>Unweighted GPA</span>
            <span style={S.statVal}>{unweightedGpa?.toFixed(3) ?? '—'}</span>
          </div>
          <div style={S.statDivider} />
          <div style={S.statChip}>
            <span style={S.statLabel}>Weighted GPA</span>
            <span style={S.statVal}>{weightedGpa?.toFixed(3) ?? '—'}</span>
          </div>
          <div style={S.statDivider} />
          <div style={S.statChip}>
            <span style={S.statLabel}>Your SAT</span>
            <span style={S.statVal}>{studentSAT ?? '—'}</span>
          </div>
          <div style={S.statDivider} />
          <div style={S.statChip}>
            <span style={S.statLabel}>Colleges Added</span>
            <span style={S.statVal}>{list.length}</span>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <div style={S.searchWrap}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            className="ns-input"
            style={S.searchInput}
            placeholder="Search colleges…"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />
          {query && (
            <button onClick={() => { setQuery(''); setShowDropdown(false) }} style={S.clearBtn}>×</button>
          )}
        </div>

        {showDropdown && suggestions.length > 0 && (
          <div style={S.dropdown}>
            {suggestions.map(c => {
              const already = addedNames.has(c.name)
              const score   = calcScore(studentGPA, studentSAT, c)
              return (
                <button
                  key={c.name}
                  style={{ ...S.dropdownRow, opacity: already ? 0.5 : 1 }}
                  onClick={() => !already && handleAdd(c.name)}
                  disabled={already || adding === c.name}
                >
                  <div style={{ flex: 1, textAlign: 'left' as const }}>
                    <div style={S.dropdownName}>{c.name}</div>
                    <div style={S.dropdownMeta}>Avg GPA {c.avgGPA} · Avg SAT {c.avgSAT}</div>
                  </div>
                  {score !== null && (
                    <span style={{ ...S.dropdownScore, color: scoreColor(score) }}>{score}</span>
                  )}
                  {already
                    ? <span style={S.addedBadge}>Added</span>
                    : <span style={S.addBtn}>{adding === c.name ? '…' : '+'}</span>
                  }
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* College list */}
      {list.length === 0 ? (
        <div className="ns-card" style={S.empty}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎓</div>
          <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No colleges yet</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Search above to add colleges you're interested in.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(item => {
            const college = COLLEGES.find(c => c.name === item.name)
            const score   = college ? calcScore(studentGPA, studentSAT, college) : null
            const color   = score !== null ? scoreColor(score) : 'var(--text-muted)'
            const label   = score !== null ? scoreLabel(score) : null

            return (
              <div key={item.id} className="ns-card" style={S.collegeCard}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.collegeName}>{item.name}</div>
                  {college && (
                    <div style={S.collegeMeta}>Avg GPA {college.avgGPA} · Avg SAT {college.avgSAT}</div>
                  )}
                  {score !== null && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Likelihood</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
                      </div>
                      <div style={S.barTrack}>
                        <div style={{ ...S.barFill, width: `${score}%`, background: color }} />
                      </div>
                    </div>
                  )}
                  {score === null && !hasStats && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Add GPA & SAT in Settings to see score</div>
                  )}
                </div>

                <div style={S.scoreBox}>
                  {score !== null ? (
                    <>
                      <div style={{ ...S.scoreNum, color }}>{score}</div>
                      <div style={S.scoreOut}>/100</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' as const }}>No<br/>data</div>
                  )}
                </div>

                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={removing === item.id}
                  style={S.removeBtn}
                  title="Remove"
                >
                  {removing === item.id ? '…' : '×'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  header:       { marginBottom: 24 },
  title:        { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', marginBottom: 4 },
  sub:          { fontSize: 13, color: 'var(--text-secondary)' },
  warnCard:     { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', marginBottom: 16, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 },
  statsRow:     { display: 'flex', alignItems: 'center', padding: '14px 20px', marginBottom: 20, gap: 0 },
  statChip:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  statLabel:    { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: 'var(--text-muted)' },
  statVal:      { fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)' },
  statDivider:  { width: 1, height: 36, background: 'var(--border)', flexShrink: 0 },
  searchWrap:   { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 14px', height: 44 },
  searchInput:  { flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text)', padding: 0 },
  clearBtn:     { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 },
  dropdown:     { position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden' },
  dropdownRow:  { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' },
  dropdownName: { fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 },
  dropdownMeta: { fontSize: 11.5, color: 'var(--text-muted)' },
  dropdownScore:{ fontSize: 15, fontWeight: 800, minWidth: 32, textAlign: 'right' as const },
  addedBadge:   { fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 20, whiteSpace: 'nowrap' as const },
  addBtn:       { fontSize: 18, fontWeight: 300, color: 'var(--primary)', lineHeight: 1, padding: '0 4px' },
  empty:        { padding: 48, textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  collegeCard:  { display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px' },
  collegeName:  { fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 },
  collegeMeta:  { fontSize: 12, color: 'var(--text-muted)' },
  barTrack:     { height: 6, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' },
  barFill:      { height: '100%', borderRadius: 99, transition: 'width 0.4s ease' },
  scoreBox:     { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 52 },
  scoreNum:     { fontSize: 28, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 },
  scoreOut:     { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  removeBtn:    { background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 },
}
