'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type ParentStudentSummary } from '../../../lib/api'

const GRADE_COLORS: Record<string, string> = {
  A: '#3FB950', B: '#00C896', C: '#D29922', D: '#F0883E', F: '#F85149',
}
function gradeColor(letter: string | null) {
  if (!letter) return 'var(--text-muted)'
  return GRADE_COLORS[letter.charAt(0).toUpperCase()] ?? 'var(--text-muted)'
}

export default function ParentDashboard() {
  const router   = useRouter()
  const [students, setStudents] = useState<ParentStudentSummary[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Add student form
  const [linkEmail, setLinkEmail]   = useState('')
  const [linking, setLinking]       = useState(false)
  const [linkError, setLinkError]   = useState<string | null>(null)
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
    setLinkError(null)
    setLinkSuccess(null)
    if (!linkEmail.trim()) return
    setLinking(true)
    try {
      const { student } = await api.parentLinkStudent(linkEmail.trim())
      setLinkSuccess(`${student.name ?? student.email} has been added to your account.`)
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

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
  if (error)   return <p style={{ color: 'var(--error)' }}>{error}</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Student Overview</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {students.length === 0 ? 'No students linked yet.' : `${students.length} student${students.length > 1 ? 's' : ''} linked to your account`}
          </p>
        </div>
        <button style={styles.addBtn} onClick={() => { setShowLinkForm(v => !v); setLinkError(null); setLinkSuccess(null) }}>
          {showLinkForm ? '✕ Cancel' : '+ Add Student'}
        </button>
      </div>

      {/* Add student form */}
      {showLinkForm && (
        <div style={styles.linkCard}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Link a student account</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Enter the email address the student used to register with NextStep.
          </p>
          <form onSubmit={e => void handleLink(e)} style={{ display: 'flex', gap: 10 }}>
            <input
              type="email"
              value={linkEmail}
              onChange={e => setLinkEmail(e.target.value)}
              placeholder="student@example.com"
              required
              style={styles.linkInput}
              disabled={linking}
            />
            <button type="submit" disabled={linking} style={styles.linkBtn}>
              {linking ? 'Adding...' : 'Add'}
            </button>
          </form>
          {linkError   && <p style={{ color: 'var(--error)',   fontSize: 13, marginTop: 8 }}>{linkError}</p>}
          {linkSuccess && <p style={{ color: 'var(--primary)', fontSize: 13, marginTop: 8 }}>{linkSuccess}</p>}
        </div>
      )}

      {/* Student cards */}
      {students.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍👩‍👧</div>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>No students yet</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Click &quot;Add Student&quot; and enter their NextStep email to get started.
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {students.map(s => (
            <div key={s.id} style={styles.studentCard}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={styles.avatar}>{(s.name ?? s.email).charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{s.name ?? s.email}</div>
                    {s.gradeLevel && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Grade {s.gradeLevel}{s.graduationYear ? ` · Class of ${s.graduationYear}` : ''}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  style={styles.removeBtn}
                  onClick={() => handleUnlink(s.id, s.name)}
                  title="Remove student"
                >✕</button>
              </div>

              {/* GPA row */}
              <div style={styles.gpaRow}>
                <div style={styles.gpaBox}>
                  <div style={styles.gpaVal}>{s.unweightedGpa.toFixed(2)}</div>
                  <div style={styles.gpaLbl}>Unweighted GPA</div>
                </div>
                <div style={styles.gpaDivider} />
                <div style={styles.gpaBox}>
                  <div style={{ ...styles.gpaVal, color: 'var(--primary)' }}>{s.weightedGpa.toFixed(2)}</div>
                  <div style={styles.gpaLbl}>Weighted GPA</div>
                </div>
                <div style={styles.gpaDivider} />
                <div style={styles.gpaBox}>
                  <div style={styles.gpaVal}>{s.pendingAssignments}</div>
                  <div style={styles.gpaLbl}>Pending</div>
                </div>
              </div>

              {/* Top courses snapshot */}
              {s.courses.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={styles.sectionLabel}>Courses</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {s.courses.slice(0, 4).map((c, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{c.name}</span>
                        <span style={{ fontWeight: 600, color: gradeColor(c.letterGrade) }}>
                          {c.letterGrade ?? '—'}
                        </span>
                      </div>
                    ))}
                    {s.courses.length > 4 && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{s.courses.length - 4} more</div>
                    )}
                  </div>
                </div>
              )}

              {/* View button */}
              <button
                style={styles.viewBtn}
                onClick={() => router.push(`/parent/students/${s.id}`)}
              >
                View Full Report →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  addBtn:      { background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  linkCard:    { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 },
  linkInput:   { flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', outline: 'none', fontSize: 14 },
  linkBtn:     { background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  emptyState:  { textAlign: 'center', padding: '80px 0', color: 'var(--text)' },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 },
  studentCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 },
  avatar:      { width: 44, height: 44, borderRadius: 22, background: 'var(--primary)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 },
  removeBtn:   { background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: 4 },
  gpaRow:      { display: 'flex', gap: 0, background: 'var(--bg)', borderRadius: 8, padding: '12px 0', marginBottom: 16, border: '1px solid var(--border)' },
  gpaBox:      { flex: 1, textAlign: 'center' as const },
  gpaVal:      { fontSize: 22, fontWeight: 700 },
  gpaLbl:      { fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 },
  gpaDivider:  { width: 1, background: 'var(--border)', alignSelf: 'stretch' },
  sectionLabel:{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 8 },
  viewBtn:     { width: '100%', background: 'transparent', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 0', color: 'var(--primary)', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 4 },
}
