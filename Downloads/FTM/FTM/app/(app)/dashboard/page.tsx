'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type StudentData } from '../../../lib/api'
import AiBar from '../../../components/ui/AiBar'

const GRADE_COLOR: Record<string, string> = { A: '#22C55E', B: '#10B981', C: '#F59E0B', D: '#F97316', F: '#EF4444' }
const gradeColor = (g: string) => GRADE_COLOR[g?.charAt(0).toUpperCase()] ?? 'var(--text-muted)'

function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
function getTimeOfDay() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

const QUICK_LINKS = [
  { href: '/grades',  label: 'Grade Portal',   sub: 'Grades & GPA',        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B6EFF" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, iconBg: 'rgba(75,110,255,0.12)' },
  { href: '/ai',      label: 'AI Chat',         sub: 'College guidance',     icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00C896" strokeWidth="2" strokeLinecap="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>, iconBg: 'rgba(0,200,150,0.1)' },
  { href: '/planner', label: 'Planner',         sub: 'Assignments & tasks',  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, iconBg: 'rgba(245,158,11,0.1)' },
  { href: '/feed',    label: 'Study Feed',      sub: 'Connect with peers',   icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>, iconBg: 'rgba(167,139,250,0.1)' },
]

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData]         = useState<StudentData | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [portalUGpa, setPortalUGpa] = useState<number | null>(null)
  const [portalWGpa, setPortalWGpa] = useState<number | null>(null)

  useEffect(() => {
    api.me().then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed'))
    api.portalGpa()
      .then(g => { setPortalUGpa(g.unweightedGpa); setPortalWGpa(g.weightedGpa) })
      .catch(() => { /* portal not connected or session expired — fall back to profile */ })
  }, [])

  if (error) return <div style={{ padding: 40, color: 'var(--error)' }}>{error}</div>
  if (!data)  return (
    <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading dashboard…</div>
  )

  const firstName = data.name?.split(' ')[0] ?? 'Student'
  const uGpa = (portalUGpa ?? data.profile?.unweightedGpa ?? 0).toFixed(2)
  const wGpa = (portalWGpa ?? data.profile?.weightedGpa ?? 0).toFixed(2)
  const today = new Date()
  const dueToday = data.assignments.filter(a => {
    if (a.completed) return false
    const d = new Date(a.dueDate)
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  })

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div>
          <p style={S.greeting}>Good {getTimeOfDay()},</p>
          <h1 style={S.name}>{firstName}</h1>
        </div>
        <span style={S.dateChip}>{formatDate()}</span>
      </div>

      {/* GPA + Due Today */}
      <div style={S.topRow}>
        <div className="ns-card" style={{ ...S.card, flex: 1 }}>
          <p style={S.cardLabel}>
            GPA
            <button onClick={() => router.push('/grades/what-if')}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 11, cursor: 'pointer', padding: 0, marginLeft: 8 }}>
              What-If →
            </button>
          </p>
          <div style={S.gpaRow}>
            <div style={S.gpaBlock}>
              <div style={S.gpaNum}>{uGpa}</div>
              <div style={S.gpaTag}>Unweighted</div>
            </div>
            <div style={S.gpaDivider} />
            <div style={S.gpaBlock}>
              <div style={{ ...S.gpaNum, ...gradientStyle }}>{wGpa}</div>
              <div style={S.gpaTag}>Weighted</div>
            </div>
          </div>
        </div>

        <div className="ns-card" style={{ ...S.card, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={S.cardLabel}>Due Today</p>
            {dueToday.length > 0 && <span style={S.countPill}>{dueToday.length}</span>}
          </div>
          {dueToday.length === 0 ? (
            <p style={S.emptyMsg}>All clear for today ✓</p>
          ) : (
            dueToday.slice(0, 3).map(a => (
              <div key={a.id} style={S.dueRow}>
                <span style={S.dueDot} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.dueTitle}>{a.title}</div>
                  <div style={S.dueSub}>{a.subject}</div>
                </div>
                <span style={S.dueTime}>{a.estimatedMinutes}m</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stat row */}
      <div style={S.statsRow}>
        {[
          { v: data.stats.totalCourses, l: 'Courses' },
          { v: data.stats.assignmentsDueThisWeek, l: 'Due This Week' },
          { v: data.stats.pendingAssignments, l: 'Pending' },
          { v: '3', l: 'Day Streak 🔥' },
        ].map(s => (
          <div key={s.l} className="ns-card" style={S.statCard}>
            <div style={S.statNum}>{s.v}</div>
            <div style={S.statLabel}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Quick navigation */}
      <p style={{ ...S.cardLabel, marginBottom: 14 }}>Quick Access</p>
      <div style={S.tilesGrid}>
        {QUICK_LINKS.map(tile => (
          <button key={tile.href} onClick={() => router.push(tile.href)} style={S.tile}>
            <div style={{ ...S.tileIcon, background: tile.iconBg }}>{tile.icon}</div>
            <div>
              <div style={S.tileTitle}>{tile.label}</div>
              <div style={S.tileSub}>{tile.sub}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* AI bar */}
      <div style={S.aiBarWrap}>
        <p style={{ ...S.cardLabel, marginBottom: 10 }}>Ask NextStep AI</p>
        <AiBar />
      </div>
    </div>
  )
}

const gradientStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg,#4B6EFF,#00C896)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

const S: Record<string, React.CSSProperties> = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  greeting:   { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 },
  name:       { fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)' },
  dateChip:   { fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px', marginTop: 4 },
  topRow:     { display: 'flex', gap: 16, marginBottom: 16 },
  card:       { padding: 20, marginBottom: 16 },
  cardLabel:  { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)' },
  gpaRow:     { display: 'flex', gap: 0, marginTop: 14, alignItems: 'center' },
  gpaBlock:   { flex: 1, textAlign: 'center' as const },
  gpaNum:     { fontSize: 36, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 },
  gpaTag:     { fontSize: 11, color: 'var(--text-secondary)', marginTop: 5 },
  gpaDivider: { width: 1, height: 44, background: 'var(--border)', flexShrink: 0 },
  countPill:  { background: 'var(--error)', color: '#fff', borderRadius: 100, padding: '2px 9px', fontSize: 11, fontWeight: 700 },
  emptyMsg:   { color: 'var(--success)', fontSize: 13, fontStyle: 'italic' },
  dueRow:     { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  dueDot:     { width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 },
  dueTitle:   { fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  dueSub:     { fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 },
  dueTime:    { fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 },
  statsRow:   { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 },
  statCard:   { padding: '16px', textAlign: 'center' as const },
  statNum:    { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 4 },
  statLabel:  { fontSize: 11.5, color: 'var(--text-secondary)' },
  tilesGrid:  { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 },
  tile:       { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.15s' },
  tileIcon:   { width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tileTitle:  { fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 },
  tileSub:    { fontSize: 12, color: 'var(--text-secondary)' },
  aiBarWrap:  { paddingBottom: 20 },
}