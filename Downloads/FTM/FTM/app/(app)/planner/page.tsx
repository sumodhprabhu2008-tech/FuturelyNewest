'use client'

import { useEffect, useState } from 'react'
import { api, type StudentData } from '../../../lib/api'

type Assignment = StudentData['assignments'][number]
type GroupKey = 'Overdue' | 'Today' | 'Tomorrow' | 'This Week' | 'Later' | 'Completed'
interface Group { key: GroupKey; items: Assignment[] }

const GROUP_META: Partial<Record<GroupKey, { color: string; bg: string }>> = {
  Overdue: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
  Today:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
}
const PRIORITY_COLOR: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: 'var(--text-muted)' }

function groupAssignments(assignments: Assignment[]): Group[] {
  const now = new Date()
  const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(todayStart.getTime() + 86400000)
  const weekEnd       = new Date(todayStart.getTime() + 7 * 86400000)
  const groups: Record<GroupKey, Assignment[]> = { Overdue: [], Today: [], Tomorrow: [], 'This Week': [], Later: [], Completed: [] }
  for (const a of assignments) {
    if (a.completed) { groups.Completed.push(a); continue }
    const due = new Date(a.dueDate)
    if (due < todayStart) groups.Overdue.push(a)
    else if (due < tomorrowStart) groups.Today.push(a)
    else if (due < new Date(tomorrowStart.getTime() + 86400000)) groups.Tomorrow.push(a)
    else if (due < weekEnd) groups['This Week'].push(a)
    else groups.Later.push(a)
  }
  const ORDER: GroupKey[] = ['Overdue', 'Today', 'Tomorrow', 'This Week', 'Later', 'Completed']
  return ORDER.filter(k => groups[k].length > 0).map(k => ({ key: k, items: groups[k] }))
}

export default function PlannerPage() {
  const [data, setData]         = useState<StudentData | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [toggling, setToggling] = useState<Set<number>>(new Set())
  const [studyPlan, setStudyPlan] = useState<Array<{ id: number; title: string; subject: string; priority: string }>>([])

  useEffect(() => {
    api.me().then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed'))
    api.studyPlan().then(r => setStudyPlan(r.plan)).catch(() => null)
  }, [])

  async function handleToggle(id: number, completed: boolean) {
    setToggling(prev => new Set([...prev, id]))
    setData(prev => prev ? {
      ...prev,
      assignments: prev.assignments.map(a => a.id === id ? { ...a, completed, completedAt: completed ? new Date().toISOString() : null } : a),
    } : prev)
    try {
      const token = localStorage.getItem('ns_token')
      await fetch(`/api/assignments/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ completed }),
      })
    } catch { /* optimistic */ }
    finally {
      setToggling(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  if (error) return <div style={{ padding: 40, color: 'var(--error)' }}>{error}</div>
  if (!data)  return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading planner…</div>

  const groups = groupAssignments(data.assignments)

  return (
    <div className="fade-up" style={S.layout}>
      {/* Left: assignment list */}
      <div style={{ flex: 2, minWidth: 0 }}>
        <h1 style={S.title}>Planner</h1>

        {groups.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>✓</div>
            <p style={S.emptyTitle}>All caught up!</p>
            <p style={S.emptySub}>No assignments pending.</p>
          </div>
        ) : groups.map(group => {
          const meta = GROUP_META[group.key]
          return (
            <div key={group.key} style={{ marginBottom: 28 }}>
              <div style={S.groupHeader}>
                <span style={{ color: meta?.color ?? 'var(--text-secondary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  {group.key}
                </span>
                <span style={{ ...S.groupCount, background: meta?.bg ?? 'var(--surface-2)', color: meta?.color ?? 'var(--text-secondary)' }}>
                  {group.items.length}
                </span>
              </div>
              {group.items.map(a => (
                <div key={a.id} className="ns-card" style={{ ...S.card, opacity: a.completed ? 0.6 : 1 }}>
                  <label style={S.cardInner}>
                    <div style={{ ...S.checkbox, borderColor: a.completed ? 'var(--primary)' : 'var(--border)', background: a.completed ? 'var(--primary)' : 'transparent' }}>
                      {a.completed && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#060D10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <input type="checkbox" checked={a.completed} disabled={toggling.has(a.id)}
                      onChange={() => void handleToggle(a.id, !a.completed)} style={{ display: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...S.cardTitle, textDecoration: a.completed ? 'line-through' : 'none', color: a.completed ? 'var(--text-muted)' : 'var(--text)' }}>
                        {a.title}
                      </div>
                      <div style={S.cardMeta}>
                        {a.subject} · {a.estimatedMinutes}m · Due {new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    {a.priority && (
                      <span style={{ ...S.priorityDot, background: PRIORITY_COLOR[a.priority] ?? 'var(--text-muted)' }} title={a.priority} />
                    )}
                  </label>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Right: AI study plan */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <h2 style={S.panelTitle}>AI Study Plan</h2>
        {studyPlan.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No upcoming assignments.</p>
        ) : studyPlan.map(item => (
          <div key={item.id} className="ns-card" style={S.studyItem}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{item.title}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[item.priority] ?? 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                {item.priority}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>{item.subject}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  layout:     { display: 'flex', gap: 32, alignItems: 'flex-start' },
  title:      { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 24 },
  panelTitle: { fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--text)' },
  groupHeader:{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  groupCount: { borderRadius: 100, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  card:       { padding: '13px 14px', marginBottom: 8 },
  cardInner:  { display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
  checkbox:   { width: 18, height: 18, borderRadius: 5, border: '1.5px solid', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, border-color 0.15s' },
  cardTitle:  { fontSize: 13.5, fontWeight: 500, transition: 'color 0.15s' },
  cardMeta:   { fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 },
  priorityDot:{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  studyItem:  { padding: '12px 14px', marginBottom: 8 },
  empty:      { textAlign: 'center' as const, padding: '60px 20px' },
  emptyIcon:  { width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, margin: '0 auto 14px' },
  emptyTitle: { fontSize: 17, fontWeight: 700, marginBottom: 5 },
  emptySub:   { fontSize: 13, color: 'var(--text-secondary)' },
}
