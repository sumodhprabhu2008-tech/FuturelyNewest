'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, type StudentData } from '../../../../lib/api'

type Tab = 'overview' | 'grades' | 'assignments' | 'chat'

const GRADE_COLORS: Record<string, string> = {
  A: '#3FB950', B: '#00C896', C: '#D29922', D: '#F0883E', F: '#F85149',
}
function gradeColor(letter: string | null) {
  if (!letter) return 'var(--text-muted)'
  return GRADE_COLORS[letter.charAt(0).toUpperCase()] ?? 'var(--text-muted)'
}

interface ChatMessage { id: string; role: 'user' | 'ai'; text: string }

export default function ParentStudentDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const studentId = parseInt(id)

  const [data, setData]     = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [tab, setTab]       = useState<Tab>('overview')

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.parentStudentDetail(studentId)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load student'))
      .finally(() => setLoading(false))
  }, [studentId])

  async function handleChat(textOverride?: string) {
    const text = (textOverride ?? chatInput).trim()
    if (!text || chatSending) return
    setChatInput('')
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text }])
    setChatSending(true)
    try {
      const { reply } = await api.parentStudentChat(studentId, text)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: reply }])
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: 'Sorry, I had trouble connecting. Please try again.' }])
    } finally {
      setChatSending(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)', padding: 32 }}>Loading student data...</p>
  if (error)   return <p style={{ color: 'var(--error)', padding: 32 }}>{error}</p>
  if (!data)   return null

  const uGpa = (data.profile?.unweightedGpa ?? 0).toFixed(2)
  const wGpa = (data.profile?.weightedGpa ?? 0).toFixed(2)
  const today = new Date()
  const dueToday = data.assignments.filter(a => {
    if (a.completed) return false
    const d = new Date(a.dueDate)
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  })

  // Grade distribution for overview stats
  const gradedCourses = data.courses.filter(c => c.grade)
  const gradeDist = gradedCourses.reduce<Record<string, number>>((acc, c) => {
    const letter = c.grade!.letterGrade.charAt(0)
    acc[letter] = (acc[letter] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      {/* Breadcrumb */}
      <button onClick={() => router.push('/parent/dashboard')} style={styles.backBtn}>
        ← Back to Students
      </button>

      {/* Student header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={styles.avatar}>{(data.name ?? data.email).charAt(0).toUpperCase()}</div>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 2 }}>{data.name ?? data.email}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {[data.profile?.gradeLevel ? `Grade ${data.profile.gradeLevel}` : '', data.profile?.graduationYear ? `Class of ${data.profile.graduationYear}` : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div style={styles.gpaChips}>
          <div style={styles.gpaChip}>
            <span style={styles.gpaNum}>{uGpa}</span>
            <span style={styles.gpaLbl}>UW GPA</span>
          </div>
          <div style={{ ...styles.gpaChip, borderColor: 'var(--primary)' }}>
            <span style={{ ...styles.gpaNum, color: 'var(--primary)' }}>{wGpa}</span>
            <span style={styles.gpaLbl}>W GPA</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {(['overview', 'grades', 'assignments', 'chat'] as Tab[]).map(t => (
          <button key={t} style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'grades' ? 'Grades' : t === 'assignments' ? 'Assignments' : 'AI Chat'}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          {/* Stats row */}
          <div style={styles.statsGrid}>
            <StatCard value={String(data.stats.totalCourses)}               label="Courses" />
            <StatCard value={String(data.stats.pendingAssignments)}          label="Pending" />
            <StatCard value={String(data.stats.assignmentsDueToday)}         label="Due Today" highlight={data.stats.assignmentsDueToday > 0} />
            <StatCard value={String(data.stats.assignmentsDueThisWeek)}      label="Due This Week" />
            <StatCard value={String(data.stats.completedAssignments)}        label="Completed" />
          </div>

          {/* Grade distribution */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Grade Distribution</div>
            {gradedCourses.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No graded courses yet.</p>
            ) : (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                {['A', 'B', 'C', 'D', 'F'].map(letter => (
                  <div key={letter} style={styles.distBadge}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: gradeColor(letter) }}>{gradeDist[letter] ?? 0}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{letter}s</span>
                  </div>
                ))}
              </div>
            )}

            {/* Course list with grades */}
            <div style={styles.cardTitle}>All Courses</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.courses.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.teacher} · Period {c.period}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {c.grade ? (
                      <>
                        <span style={{ fontSize: 18, fontWeight: 700, color: gradeColor(c.grade.letterGrade) }}>{c.grade.letterGrade}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>{c.grade.percentage.toFixed(1)}%</span>
                      </>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Due today */}
          {dueToday.length > 0 && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>Due Today ({dueToday.length})</div>
              {dueToday.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 14 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.subject}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.estimatedMinutes}m</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GRADES ── */}
      {tab === 'grades' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: 32, marginBottom: 24 }}>
            <div><div style={styles.gpaLbl}>Unweighted GPA</div><div style={{ fontSize: 28, fontWeight: 700 }}>{uGpa}</div></div>
            <div style={styles.gpaDivider} />
            <div><div style={styles.gpaLbl}>Weighted GPA</div><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{wGpa}</div></div>
            <div style={styles.gpaDivider} />
            <div><div style={styles.gpaLbl}>Courses</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.courses.length}</div></div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Course', 'Teacher', 'Period', 'Type', 'Grade', '%'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.courses.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px', fontSize: 14 }}>{c.name}</td>
                  <td style={{ padding: '12px', fontSize: 14, color: 'var(--text-secondary)' }}>{c.teacher}</td>
                  <td style={{ padding: '12px', fontSize: 14 }}>{c.period}</td>
                  <td style={{ padding: '12px', fontSize: 12 }}>
                    <span style={{ background: c.courseType === 'AP' ? 'rgba(88,166,255,0.15)' : c.courseType === 'HONORS' ? 'rgba(188,140,255,0.15)' : 'var(--border)', color: c.courseType === 'AP' ? '#58A6FF' : c.courseType === 'HONORS' ? '#BC8CFF' : 'var(--text-secondary)', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{c.courseType}</span>
                  </td>
                  <td style={{ padding: '12px', fontSize: 16, fontWeight: 700, color: gradeColor(c.grade?.letterGrade ?? null) }}>{c.grade?.letterGrade ?? '—'}</td>
                  <td style={{ padding: '12px', fontSize: 14, color: 'var(--text-secondary)' }}>{c.grade ? `${c.grade.percentage.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ASSIGNMENTS ── */}
      {tab === 'assignments' && (
        <div style={styles.card}>
          {data.assignments.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No assignments on file.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Assignment', 'Subject', 'Due Date', 'Est.', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.assignments.map(a => {
                  const due = new Date(a.dueDate)
                  const isOverdue = !a.completed && due < new Date()
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', opacity: a.completed ? 0.5 : 1 }}>
                      <td style={{ padding: '12px', fontSize: 14, textDecoration: a.completed ? 'line-through' : 'none' }}>{a.title}</td>
                      <td style={{ padding: '12px', fontSize: 14, color: 'var(--text-secondary)' }}>{a.subject}</td>
                      <td style={{ padding: '12px', fontSize: 13, color: isOverdue ? 'var(--error)' : 'var(--text-secondary)' }}>
                        {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {isOverdue && ' (overdue)'}
                      </td>
                      <td style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>{a.estimatedMinutes}m</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: a.completed ? 'rgba(63,185,80,0.15)' : isOverdue ? 'rgba(248,81,73,0.15)' : 'rgba(210,153,34,0.15)', color: a.completed ? '#3FB950' : isOverdue ? 'var(--error)' : '#D29922' }}>
                          {a.completed ? 'Done' : isOverdue ? 'Overdue' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── AI CHAT ── */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)' }}>
          <div style={styles.chatBanner}>
            AI context: {data.name ?? data.email}&apos;s academic data
          </div>
          <div style={styles.messages}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: 'var(--text-secondary)' }}>
                <div style={styles.chatLogo}>N</div>
                <p>Ask about {data.name?.split(' ')[0] ?? 'your student'}&apos;s grades, progress, or study tips.</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} style={{ ...styles.bubble, ...(m.role === 'user' ? styles.bubbleUser : styles.bubbleAi) }}>{m.text}</div>
            ))}
            {chatSending && <div style={{ ...styles.bubble, ...styles.bubbleAi, color: 'var(--text-muted)' }}>Thinking...</div>}
            <div ref={bottomRef} />
          </div>
          <div style={styles.inputBar}>
            <input style={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleChat() }}
              placeholder={`Ask about ${data.name?.split(' ')[0] ?? 'student'}...`} disabled={chatSending} />
            <button style={{ ...styles.sendBtn, opacity: chatSending ? 0.6 : 1 }}
              onClick={() => void handleChat()} disabled={chatSending}>Send</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${highlight ? 'var(--error)' : 'var(--border)'}`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: highlight ? 'var(--error)' : 'var(--text)', marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backBtn:     { background: 'none', border: 'none', color: 'var(--primary)', fontSize: 14, cursor: 'pointer', marginBottom: 20, padding: 0, fontWeight: 500 },
  avatar:      { width: 56, height: 56, borderRadius: 28, background: 'var(--primary)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, flexShrink: 0 },
  gpaChips:    { marginLeft: 'auto', display: 'flex', gap: 10 },
  gpaChip:     { border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', textAlign: 'center' as const, minWidth: 70 },
  gpaNum:      { display: 'block', fontSize: 22, fontWeight: 700 },
  gpaLbl:      { fontSize: 11, color: 'var(--text-secondary)', display: 'block' },
  gpaDivider:  { width: 1, background: 'var(--border)', alignSelf: 'stretch' },
  tabBar:      { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 },
  tabBtn:      { background: 'none', border: 'none', padding: '10px 20px', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabBtnActive:{ color: 'var(--primary)', borderBottom: '2px solid var(--primary)', fontWeight: 600 },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 },
  card:        { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle:   { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 16 },
  distBadge:   { display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 56 },
  chatBanner:  { background: 'rgba(0,200,150,0.08)', border: '1px solid rgba(0,200,150,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'var(--primary)', marginBottom: 12 },
  messages:    { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },
  bubble:      { maxWidth: '70%', padding: '12px 16px', borderRadius: 16, fontSize: 14, lineHeight: 1.5 },
  bubbleUser:  { background: 'var(--primary)', color: 'var(--bg)', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAi:    { background: 'var(--surface)', border: '1px solid var(--border)', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  inputBar:    { display: 'flex', gap: 10 },
  chatInput:   { flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', color: 'var(--text)', outline: 'none', fontSize: 15 },
  sendBtn:     { background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 600, fontSize: 14 },
  chatLogo:    { width: 52, height: 52, borderRadius: 14, background: 'var(--primary)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 },
}
