'use client'

import { useState } from 'react'

interface Assignment {
  score: number | null
  total: number | null
}

interface Hypothetical {
  title: string
  score: number
  total: number
  weight: string
}

interface WhatIfScorerProps {
  currentAverage: number
  existingAssignments: Assignment[]
  onClose: () => void
}

function recalculate(
  existing: Assignment[],
  hyps: Hypothetical[],
): number | null {
  const graded = existing.filter(
    a => a.score !== null && a.score !== undefined &&
         a.total !== null && a.total !== undefined && (a.total ?? 0) > 0,
  )
  const validHyps = hyps.filter(h => h.total > 0)

  if (graded.length === 0 && validHyps.length === 0) return null

  const earned   = graded.reduce((s, a) => s + (a.score ?? 0), 0)
               + validHyps.reduce((s, h) => s + h.score, 0)
  const possible = graded.reduce((s, a) => s + (a.total ?? 0), 0)
               + validHyps.reduce((s, h) => s + h.total, 0)

  return possible === 0 ? null : (earned / possible) * 100
}

export default function WhatIfScorer({ currentAverage, existingAssignments, onClose }: WhatIfScorerProps) {
  const [title,  setTitle]  = useState('')
  const [grade,  setGrade]  = useState('')
  const [total,  setTotal]  = useState('100')
  const [weight, setWeight] = useState('Daily')
  const [hyps,   setHyps]   = useState<Hypothetical[]>([])

  function add() {
    const s = parseFloat(grade)
    const t = parseFloat(total)
    if (isNaN(s) || isNaN(t) || t <= 0) return
    setHyps(prev => [...prev, { title: title.trim() || 'Untitled', score: s, total: t, weight }])
    setTitle(''); setGrade(''); setTotal('100')
  }

  const simAvg    = hyps.length > 0 ? (recalculate(existingAssignments, hyps) ?? currentAverage) : currentAverage
  const delta     = simAvg - currentAverage
  const deltaColor = delta > 0.05 ? '#22C55E' : delta < -0.05 ? '#EF4444' : 'var(--text-muted)'

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <span style={S.label}>What-If Scorer</span>
        <button onClick={onClose} style={S.closeBtn}>✕ Close</button>
      </div>

      <div style={S.scoreRow}>
        <div>
          <div style={S.scoreTag}>Current</div>
          <div style={S.scoreNum}>{currentAverage.toFixed(1)}%</div>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>→</span>
        <div>
          <div style={S.scoreTag}>Simulated</div>
          <div style={{ ...S.scoreNum, color: hyps.length > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
            {simAvg.toFixed(1)}%
          </div>
        </div>
        {hyps.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' as const }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: deltaColor }}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      <div style={S.inputRow}>
        <input className="ns-input" style={{ flex: 2, height: 36, fontSize: 12 }} type="text"
          value={title} onChange={e => setTitle(e.target.value)} placeholder="Assignment title" />
        <input className="ns-input" style={{ flex: 1, height: 36, fontSize: 12 }} type="number"
          value={grade} onChange={e => setGrade(e.target.value)} placeholder="Score"
          onKeyDown={e => e.key === 'Enter' && add()} />
        <input className="ns-input" style={{ flex: 1, height: 36, fontSize: 12 }} type="number"
          value={total} onChange={e => setTotal(e.target.value)} placeholder="/ 100"
          onKeyDown={e => e.key === 'Enter' && add()} />
      </div>

      <div style={S.ctaRow}>
        <select className="ns-input" style={{ height: 34, fontSize: 12, width: 'auto', paddingRight: 8 }}
          value={weight} onChange={e => setWeight(e.target.value)}>
          {['Daily', 'Quiz', 'Test/Major', 'Lab', 'Project', 'Other'].map(w => <option key={w}>{w}</option>)}
        </select>
        <button className="ns-btn-primary" style={{ height: 34, padding: '0 16px', fontSize: 12 }}
          onClick={add} disabled={!grade || !total}>
          + Add
        </button>
        {hyps.length > 0 && (
          <button className="ns-btn-ghost" style={{ height: 34, padding: '0 12px', fontSize: 12 }}
            onClick={() => setHyps([])}>
            Clear all
          </button>
        )}
      </div>

      {hyps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {hyps.map((h, i) => (
            <div key={i} style={S.hypRow}>
              <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{h.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>{h.weight}</span>
              <span style={{ fontWeight: 500 }}>{h.score}/{h.total}</span>
              <button onClick={() => setHyps(p => p.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 8, fontSize: 12, padding: '0 2px' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
        Approximation — exact result depends on your teacher&apos;s category weights.
      </p>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  wrap:     { background: 'rgba(0,200,150,0.04)', border: '1px solid rgba(0,200,150,0.2)', borderRadius: 10, padding: '14px 16px' },
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  label:    { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.7px', color: 'var(--text-muted)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' },
  scoreRow: { display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 },
  scoreTag: { fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 2 },
  scoreNum: { fontSize: 18, fontWeight: 700, color: 'var(--text)' },
  inputRow: { display: 'flex', gap: 8, marginBottom: 8 },
  ctaRow:   { display: 'flex', gap: 8, alignItems: 'center' },
  hypRow:   { display: 'flex', alignItems: 'center', background: 'var(--surface-2)', borderRadius: 6, padding: '6px 10px', fontSize: 12 },
}
