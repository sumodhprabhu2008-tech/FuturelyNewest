'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const BASE = ''

interface Teacher {
  name: string
  courseName: string
  period: string
  emailHint: string
}

interface HACClass {
  name: string
  period: string
  teacher: string
  room: string
  average: string | null
}

function initials(name: string) {
  return name.trim().split(' ').map(p => p.charAt(0)).join('').slice(0, 2).toUpperCase()
}

function apiFetch<T>(path: string): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ns_token') : null
  return fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(r => r.json())
}

export default function ContactTeachersPage() {
  const router = useRouter()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ data?: { teachers?: Teacher[] }; error?: { message?: string } | string }>('/api/integrations/grades/contact-teachers')
      .then(json => {
        if (json.error) {
          // Fallback: derive from classwork data
          return apiFetch<{ data?: { classes?: HACClass[] }; error?: unknown }>('/api/integrations/grades/classwork')
            .then(cj => {
              const classes: HACClass[] = cj.data?.classes ?? []
              const seen = new Set<string>()
              const derived: Teacher[] = []
              for (const c of classes) {
                const teacher = c.teacher?.trim()
                if (!teacher || seen.has(teacher.toLowerCase())) continue
                seen.add(teacher.toLowerCase())
                const parts = teacher.split(/\s+/)
                const emailHint = parts.length >= 2
                  ? `${parts[0].toLowerCase()}.${parts[parts.length - 1].toLowerCase()}@katyisd.org`
                  : `${teacher.toLowerCase().replace(/\s+/g, '.')}@katyisd.org`
                derived.push({ name: teacher, courseName: c.name, period: c.period || '', emailHint })
              }
              setTeachers(derived)
            })
        }
        setTeachers(json.data?.teachers ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load teacher contacts'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading teachers…</div>

  return (
    <div className="fade-up">
      <button onClick={() => router.push('/grades')} style={S.back}>← Grade Portal</button>
      <h1 style={S.title}>Contact Teachers</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 20, lineHeight: 1.5 }}>
        Email addresses are estimated from teacher names. Verify with the school directory before sending.
      </p>

      {error && (
        <div style={S.errorBanner}>
          {error}
          {error.toLowerCase().includes('session') && (
            <span> — <a href="/settings" style={{ color: 'var(--warning)', textDecoration: 'underline' }}>reconnect in Settings</a></span>
          )}
        </div>
      )}

      <div style={S.grid}>
        {teachers.map((t, i) => (
          <div key={i} className="ns-card" style={S.card}>
            <div style={S.avatar}>{initials(t.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.name}>{t.name}</div>
              <div style={S.course}>{t.period ? `P${t.period} — ` : ''}{t.courseName}</div>
              <div style={S.hint}>{t.emailHint}</div>
            </div>
            <a href={`mailto:${t.emailHint}`} style={S.emailBtn}>Email</a>
          </div>
        ))}
      </div>

      {teachers.length === 0 && !error && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No teacher data available. Make sure your grades are loaded.
        </p>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  back:     { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 },
  title:    { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 },
  errorBanner: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 },
  grid:     { display: 'flex', flexDirection: 'column', gap: 10 },
  card:     { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' },
  avatar:   { width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-dim)', border: '1px solid var(--primary)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  name:     { fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 },
  course:   { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 },
  hint:     { fontSize: 11.5, color: 'var(--text-muted)' },
  emailBtn: { flexShrink: 0, padding: '6px 14px', borderRadius: 8, background: 'var(--primary-dim)', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: 12, fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s' },
}
