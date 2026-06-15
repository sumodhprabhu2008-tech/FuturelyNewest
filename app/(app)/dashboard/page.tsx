'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type StudentData } from '../../../lib/api'
import AiBar from '../../../components/ui/AiBar'
import PageLoader from '../../../components/ui/PageLoader'

const STREAK_MILESTONES = [
  { days: 7,   tag: 'Novice',  tagColor: '#22C55E', emoji: '✅' },
  { days: 14,  tag: 'Pro',     tagColor: '#3B82F6', emoji: '⚡' },
  { days: 30,  tag: 'Veteran', tagColor: '#F97316', emoji: '🏅' },
  { days: 50,  tag: 'Legend',  tagColor: '#EC4899', emoji: '💎' },
  { days: 100, tag: 'GOD',     tagColor: '#EAB308', emoji: '👑' },
]

function streakCoinBonus(streak: number) {
  return Math.min(275, 30 + Math.max(0, streak - 1) * 5)
}

function getNextMilestone(streak: number) {
  return STREAK_MILESTONES.find(m => m.days > streak) ?? null
}

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
  { href: '/colleges',label: 'Colleges',        sub: 'Track your college list', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, iconBg: 'rgba(236,72,153,0.1)' },
  { href: '/marketplace',label: 'Marketplace',   sub: 'Buy, sell & trade items', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>, iconBg: 'rgba(249,115,22,0.1)' },
]

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData]         = useState<StudentData | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [portalUGpa, setPortalUGpa] = useState<number | null>(null)
  const [portalWGpa, setPortalWGpa] = useState<number | null>(null)
  const [courseCount, setCourseCount] = useState<number | null>(null)
  const [semesterLabel, setSemesterLabel] = useState<string>('')
  const [dayStreak, setDayStreak] = useState(0)
  const [coins, setCoins] = useState<number | null>(null)
  const [newlyAwardedTags, setNewlyAwardedTags] = useState<Array<{ tag: string; tagColor: string }>>([])
  const [showStreakPopup, setShowStreakPopup] = useState(false)
  const [showResyncPopup, setShowResyncPopup] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [resyncError, setResyncError] = useState<string | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const gpaNeedsResync = useRef(false)

  useEffect(() => {
    // Track day streak using localStorage
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const lastVisit = localStorage.getItem('ns_lastVisit')
    const streak = parseInt(localStorage.getItem('ns_streak') ?? '0', 10)

    let currentStreak = streak
    if (lastVisit === today) {
      setDayStreak(streak)
    } else if (lastVisit) {
      const lastDate = new Date(lastVisit)
      const todayDate = new Date(today)
      const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000)
      if (diffDays === 1) {
        currentStreak = streak + 1
        localStorage.setItem('ns_streak', String(currentStreak))
        setDayStreak(currentStreak)
      } else {
        currentStreak = 1
        localStorage.setItem('ns_streak', '1')
        setDayStreak(1)
      }
    } else {
      currentStreak = 1
      localStorage.setItem('ns_streak', '1')
      setDayStreak(1)
    }
    localStorage.setItem('ns_lastVisit', today)

    // Claim daily coins + award any streak milestone tags
    if (currentStreak > 0) {
      api.streakReward(currentStreak)
        .then(r => { if (r.newTags?.length) setNewlyAwardedTags(r.newTags) })
        .catch(() => {})
    }
    api.marketplaceDailyClaim(currentStreak)
      .then(r => setCoins(r.coins))
      .catch(() => {})
    api.me().then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed'))
    api.portalGpa()
      .then(g => { setPortalUGpa(g.unweightedGpa); setPortalWGpa(g.weightedGpa) })
      .catch(() => {})

    api.portalStatus().then(status => {
      if (!status.connected) return
      const now = new Date()
      const isFall = now.getMonth() >= 7
      setSemesterLabel(isFall ? `Fall ${now.getFullYear()}` : `Spring ${now.getFullYear()}`)
      api.portalGrades()
        .then(g => { setCourseCount(new Set(g.grades.map(c => c.name)).size) })
        .catch(() => { gpaNeedsResync.current = true })
    }).catch(() => {})

    const resyncTimer = setTimeout(() => {
      if (gpaNeedsResync.current) setShowResyncPopup(true)
    }, 6000)

    return () => clearTimeout(resyncTimer)
  }, [])

  async function handleResync() {
    setResyncing(true)
    setResyncError(null)
    setNeedsReconnect(false)
    try {
      await api.portalSyncProfile()
      const [g, grades, freshData] = await Promise.all([api.portalGpa(), api.portalGrades(), api.me()])
      setPortalUGpa(g.unweightedGpa)
      setPortalWGpa(g.weightedGpa)
      setCourseCount(new Set(grades.grades.map(c => c.name)).size)
      setData(freshData)
      setShowResyncPopup(false)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'NOT_CONNECTED' || code === 'NO_CREDENTIALS' || code === 'RELOGIN_FAILED') {
        setNeedsReconnect(true)
      } else {
        setResyncError(err instanceof Error ? err.message : 'Re-sync failed')
      }
    } finally {
      setResyncing(false)
    }
  }

  if (error) return <div style={{ padding: 40, color: 'var(--error)' }}>{error}</div>
  if (!data) return <PageLoader message="Opening dashboard…" />

  const firstName = data.name?.split(' ')[0] ?? 'Student'
  const uGpa = (portalUGpa ?? data.profile?.unweightedGpa ?? 0).toFixed(3)
  const wGpa = (portalWGpa ?? data.profile?.weightedGpa ?? 0).toFixed(3)
  const today = new Date()
  const dueToday = data.assignments.filter(a => {
    if (a.completed) return false
    const d = new Date(a.dueDate)
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  })

  // Count courses by semester from database as fallback
  const dbCourseCount = (() => {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()
    const isFall = month >= 7
    const semSuffix = isFall ? 'FA' : 'SP'
    const semKey = `${year}-${semSuffix}`
    return data.courses.filter(c => c.semester === semKey).length
  })()

  const displayCourseCount = courseCount || dbCourseCount

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div>
          <p style={S.greeting}>Good {getTimeOfDay()},</p>
          <h1 style={S.name}>{firstName}</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={S.dateChip}>{formatDate()}</span>
          {coins !== null && (
            <span style={{ fontSize: 12, color: '#EAB308', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)', borderRadius: 20, padding: '4px 10px', fontWeight: 700 }}>
              🪙 {coins.toLocaleString()} coins
            </span>
          )}
        </div>
      </div>

      {/* GPA + Due Today */}
      <div style={S.topRow}>
        <div className="ns-card" style={{ ...S.card, flex: 1, cursor: 'pointer' }} onClick={() => router.push('/grades/what-if')}>
          <p style={S.cardLabel}>GPA</p>
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
          {showResyncPopup && (
            <button
              onClick={e => { e.stopPropagation(); setShowResyncPopup(true) }}
              style={S.resyncBanner}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
              Some data didn't load · Re-sync
            </button>
          )}
        </div>

        <div className="ns-card" style={{ ...S.card, flex: 1, cursor: 'pointer' }} onClick={() => router.push('/planner')}>
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
        <div className="ns-card" style={{ ...S.statCard, cursor: 'pointer' }} onClick={() => router.push('/grades/schedule')}>
          <div style={S.statNum}>{displayCourseCount}</div>
          <div style={S.statLabel}>Courses · {semesterLabel || 'This Semester'}</div>
        </div>
        <div className="ns-card" style={{ ...S.statCard, cursor: 'pointer' }} onClick={() => router.push('/planner')}>
          <div style={S.statNum}>{data.stats.assignmentsDueThisWeek}</div>
          <div style={S.statLabel}>Due This Week</div>
        </div>
        <div className="ns-card" style={{ ...S.statCard, cursor: 'pointer' }} onClick={() => router.push('/planner')}>
          <div style={S.statNum}>{data.stats.pendingAssignments}</div>
          <div style={S.statLabel}>Pending</div>
        </div>
        <div className="ns-card" style={{ ...S.statCard, cursor: 'pointer' }} onClick={() => setShowStreakPopup(true)}>
          <div style={S.statNum}>{dayStreak}</div>
          <div style={S.statLabel}>Day Streak 🔥</div>
          <div style={{ ...S.statSub, color: '#EAB308' }}>🪙 +{streakCoinBonus(dayStreak)} today</div>
          {(() => {
            const next = getNextMilestone(dayStreak)
            if (!next) return <div style={S.statSub} title="All streak rewards earned">👑 GOD</div>
            return <div style={S.statSub}>Next: {next.days}d → {next.tag}</div>
          })()}
        </div>
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

      {/* Streak Popup */}
      {showStreakPopup && (
        <div style={S.popupOverlay} onClick={() => setShowStreakPopup(false)}>
          <div style={S.popupCard} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowStreakPopup(false)} style={S.popupClose}>×</button>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔥</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
              {dayStreak} Day Streak!
            </h3>
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#EAB308', fontWeight: 600, textAlign: 'center' as const }}>
              🪙 +{streakCoinBonus(dayStreak)} coins today · +5 more each extra day
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Start at +30 coins on day 1, and earn +5 more for every consecutive day. Log in every day to unlock exclusive tags too!
            </p>

            {newlyAwardedTags.length > 0 && (
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#22C55E', fontWeight: 600 }}>
                🎉 You just earned: {newlyAwardedTags.map(t => t.tag).join(', ')}!
              </div>
            )}

            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 10 }}>Tag Rewards</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {STREAK_MILESTONES.map(m => {
                const earned = dayStreak >= m.days
                return (
                  <div key={m.days} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 12px', borderRadius: 10,
                    background: earned ? 'var(--surface-2)' : 'transparent',
                    border: `1px solid ${earned ? m.tagColor + '44' : 'var(--border)'}`,
                    opacity: earned ? 1 : 0.5,
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{earned ? m.emoji : '🔒'}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: earned ? m.tagColor : 'var(--text-secondary)' }}>
                        {m.tag}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{m.days}d · 🪙 +{streakCoinBonus(m.days)}/day</span>
                    </div>
                    {earned && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.tagColor, background: m.tagColor + '22', borderRadius: 6, padding: '2px 7px' }}>Earned</span>
                    )}
                  </div>
                )
              })}
            </div>

            <button onClick={() => setShowStreakPopup(false)} style={S.popupButton}>
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* HAC session expired / resync popup */}
      {showResyncPopup && (
        <div style={S.popupOverlay} onClick={() => setShowResyncPopup(false)}>
          <div style={S.popupCard} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowResyncPopup(false)} style={S.popupClose}>×</button>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{needsReconnect ? '🔗' : '🔄'}</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
              {needsReconnect ? 'Reconnect your school account' : 'Some school data didn\'t load'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              {needsReconnect
                ? 'Your saved HAC credentials couldn\'t be used to sign in — your password may have changed, or credentials weren\'t saved. Go to Settings to sign in again and everything will sync automatically.'
                : 'Your GPA loaded fine, but your course list couldn\'t be fetched — your HAC session may have expired mid-load. Hit "Re-sync" to reconnect and pull everything in together.'}
            </p>
            {resyncError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--error)' }}>
                {resyncError}
              </div>
            )}
            {needsReconnect ? (
              <button
                onClick={() => { setShowResyncPopup(false); router.push('/settings') }}
                style={S.popupButton}
              >
                Go to Settings to reconnect
              </button>
            ) : (
              <button
                onClick={handleResync}
                disabled={resyncing}
                style={{ ...S.popupButton, opacity: resyncing ? 0.7 : 1, cursor: resyncing ? 'not-allowed' : 'pointer' }}
              >
                {resyncing ? 'Syncing…' : 'Re-sync with HAC'}
              </button>
            )}
            <button onClick={() => setShowResyncPopup(false)} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginTop: 8 }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

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
  dateChip:   { fontSize: 12, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '5px 12px', marginTop: 4 },
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
  statSub:    { fontSize: 10, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  tilesGrid:  { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 },
  tile:       { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.15s' },
  tileIcon:   { width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tileTitle:  { fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 },
  tileSub:    { fontSize: 12, color: 'var(--text-secondary)' },
  aiBarWrap:  { paddingBottom: 20 },
  popupOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  popupCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  popupClose: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 },
  popupBenefit: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10 },
  popupButton: { width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 16 },
  resyncBanner: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)', color: '#F59E0B', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.1px' },
}
