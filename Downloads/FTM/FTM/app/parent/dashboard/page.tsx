'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ParentStudentSummary } from '../../../lib/api'

const GRADE_COLORS: Record<string, string> = {
  A: '#22C55E', B: '#10B981', C: '#F59E0B', D: '#F97316', F: '#EF4444',
}
function gradeColor(letter: string | null) {
  if (!letter) return 'var(--text-muted)'
  return GRADE_COLORS[letter.charAt(0).toUpperCase()] ?? 'var(--text-muted)'
}

function initials(name: string | null, email: string) {
  const n = name || email
  return n.slice(0, 2).toUpperCase()
}

export default function ParentDashboard() {
  const router = useRouter()
  const [students, setStudents] = useState<ParentStudentSummary[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const [linkEmail, setLinkEmail]     = useState('')
  const [linking, setLinking]         = useState(false)
  const [linkError, setLinkError]     = useState<string | null>(null)
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null)
  const [showLinkForm, setShowLinkForm] = useState(false)

  useEffect(() => {
    api.parentStudents()
      .then(setStudents)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load students'))
      .finally(() => setLoading(false))
  }, [])

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    setLinkError(null); setLinkSuccess(null)
    if (!linkEmail.trim()) return
    setLinking(true)
    try {
      const { student } = await api.parentLinkStudent(linkEmail.trim())
      setLinkSuccess(`${student.name ?? student.email} added successfully.`)
      setLinkEmail('')
      const updated = await api.parentStudents()
      setStudents(updated)
      setTimeout(() => setShowLinkForm(false), 1500)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to link student')
    } finally {
      setLinking(false)
    }
  }

  async function handleUnlink(studentId: number, studentName: string | null) {
    if (!confirm(`Remove ${studentName ?? 'this student'} from your account?`)) return
    try {
      await api.parentUnlinkStudent(studentId)
      setStudents(prev => prev.filter(s => s.id !== studentId))
    } catch {
      alert('Failed to remove student')
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading students…</div>
  if (error)   return <div style={{ padding: 40, color: 'var(--error)' }}>{error}</div>

  return (
    <div className="fade-up">
      {/* Page header */}
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.title}>Student Overview</h1>
          <p style={S.subtitle}>
            {students.length === 0
              ? 'No students linked yet.'
              : `${students.length} student${students.length > 1 ? 's' : ''} linked to your account`}
          </p>
        </div>
        <button className="ns-btn-primary" style={{ height: 40, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => { setShowLinkForm(v => !v); setLinkError(null); setLinkSuccess(null) }}>
          {showLinkForm ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Cancel
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Student
            </>
          )}
        </button>
      </div>

      {/* Link form */}
      {showLinkForm && (
        <div className="ns-card" style={{ padding: 20, marginBottom: 24 }}>
          <p style={S.cardLabel}>Link a student account</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Enter the email address the student used to register with NextStep.
          </p>
          <form onSubmit={e => void handleLink(e)} style={{ display: 'flex', gap: 10 }}>
            <input className="ns-input" type="email" value={linkEmail}
              onChange={e => setLinkEmail(e.target.value)}
              placeholder="student@example.com" required disabled={linking}
              style={{ flex: 1, height: 42 }} />
            <button className="ns-btn-primary" type="submit" disabled={linking} style={{ height: 42, padding: '0 20px' }}>
              {linking ? 'Adding…' : 'Add'}
            </button>
          </form>
          {linkError   && <p style={{ color: 'var(--error)',   fontSize: 13, marginTop: 10 }}>{linkError}</p>}
          {linkSuccess && <p style={{ color: 'var(--primary)', fontSize: 13, marginTop: 10 }}>{linkSuccess}</p>}
        </div>
      )}

      {/* Empty state */}
      {students.length === 0 ? (
        <div style={S.empty}>
          <div style={S.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <p style={S.emptyTitle}>No students yet</p>
          <p style={S.emptySub}>Click &quot;Add Student&quot; and enter their NextStep email to get started.</p>
        </div>
      ) : (
        <div style={S.grid}>
          {students.map(s => (
            <div key={s.id} className="ns-card" style={{ padding: 20 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={S.avatar}>{initials(s.name, s.email)}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name ?? s.email}</div>
                    {s.gradeLevel && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Grade {s.gradeLevel}{s.graduationYear ? ` · Class of ${s.graduationYear}` : ''}
                      </div>
                    )}
                  </div>
                </div>
                <button style={S.removeBtn} onClick={() => handleUnlink(s.id, s.name)} title="Remove student">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* GPA row */}
              <div style={S.gpaRow}>
                <div style={{ flex: 1, textAlign: 'center' as const }}>
                  <div style={S.gpaVal}>{s.unweightedGpa.toFixed(2)}</div>
                  <div style={S.gpaLbl}>UW GPA</div>
                </div>
                <div style={S.gpaDivider} />
                <div style={{ flex: 1, textAlign: 'center' as const }}>
                  <div style={{ ...S.gpaVal, ...gradientStyle }}>{s.weightedGpa.toFixed(2)}</div>
                  <div style={S.gpaLbl}>W GPA</div>
                </div>
                <div style={S.gpaDivider} />
                <div style={{ flex: 1, textAlign: 'center' as const }}>
                  <div style={{ ...S.gpaVal, color: s.pendingAssignments > 0 ? 'var(--warning)' : 'var(--text)' }}>{s.pendingAssignments}</div>
                  <div style={S.gpaLbl}>Pending</div>
                </div>
              </div>

              {/* Courses */}
              {s.courses.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={S.sectionLabel}>Courses</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {s.courses.slice(0, 4).map((c, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{c.name}</span>
                        <span style={{ fontWeight: 700, color: gradeColor(c.letterGrade), fontSize: 14 }}>
                          {c.letterGrade ?? '—'}
                        </span>
                      </div>
                    ))}
                    {s.courses.length > 4 && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{s.courses.length - 4} more courses</div>
                    )}
                  </div>
                </div>
              )}

              {/* View button */}
              <button className="ns-btn-ghost" style={{ width: '100%', height: 38, fontSize: 13 }}
                onClick={() => router.push(`/parent/students/${s.id}`)}>
                View Full Report
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 6 }}>
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const gradientStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg,#00C896,#4DC8E0)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

const S: Record<string, React.CSSProperties> = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:      { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 4 },
  subtitle:   { fontSize: 13, color: 'var(--text-secondary)' },
  cardLabel:  { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 6 },
  empty:      { textAlign: 'center', padding: '80px 0' },
  emptyIcon:  { width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  emptyTitle: { fontSize: 17, fontWeight: 700, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: 'var(--text-secondary)' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 },
  avatar:     { width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#00A3CC,#4DC8E0)', color: '#060D10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, flexShrink: 0 },
  removeBtn:  { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' },
  gpaRow:     { display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: '12px 0', marginBottom: 16, border: '1px solid var(--border)' },
  gpaVal:     { fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 4 },
  gpaLbl:     { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' },
  gpaDivider: { width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 4px' },
  sectionLabel:{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 },
}
