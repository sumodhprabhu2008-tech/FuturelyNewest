'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../lib/api'

export default function LoginPage() {
  const router = useRouter()

  // Mode toggle
  const [mode, setMode]         = useState<'login' | 'register'>('login')

  // NextStep account fields
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName]         = useState('')

  // HAC school portal fields (optional)
  const [showHac, setShowHac]         = useState(false)
  const [hacUrl, setHacUrl]           = useState('https://homeaccess.katyisd.org/')
  const [hacUsername, setHacUsername] = useState('')
  const [hacPassword, setHacPassword] = useState('')

  const [error, setError]       = useState<string | null>(null)
  const [hacError, setHacError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep]         = useState<'login' | 'connecting'>('login')
  const [success, setSuccess]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setHacError(null)

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
        return
      }
    }

    setIsLoading(true)

    try {
      let result: { token: string; user: { id: number; name: string | null; role: string } }

      if (mode === 'register') {
        result = await api.register(email, password, name.trim() || undefined)
      } else {
        result = await api.login(email, password)
      }

      localStorage.setItem('ns_token', result.token)
      localStorage.setItem('ns_user', JSON.stringify(result.user))

      // Step 2: If HAC credentials were provided, connect the school portal
      if (showHac && hacUsername.trim() && hacPassword.trim() && hacUrl.trim()) {
        setStep('connecting')
        try {
          await api.portalLoginHAC(hacUrl.trim(), hacUsername.trim(), hacPassword.trim())
          localStorage.setItem('ns_hac_url', hacUrl.trim())
        } catch (hacErr) {
          setHacError(hacErr instanceof Error ? hacErr.message : 'School portal connection failed')
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : (mode === 'register' ? 'Registration failed' : 'Login failed'))
    } finally {
      setIsLoading(false)
      setStep('login')
    }
  }

  function switchMode() {
    setMode(m => m === 'login' ? 'register' : 'login')
    setError(null)
    setSuccess(null)
  }

  const isRegister = mode === 'register'

  const btnLabel = isLoading
    ? (step === 'connecting' ? 'Connecting to school portal...' : isRegister ? 'Creating account...' : 'Logging in...')
    : isRegister ? 'Create Account' : 'Log In'

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/"><img src="/logo.jpg" alt="NextStep" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 16 }} /></a>
        <h1 style={styles.heading}>NextStep</h1>
        <p style={styles.subheading}>{isRegister ? 'Create your account' : 'Your academic companion'}</p>

        <form onSubmit={(e) => void handleSubmit(e)} style={styles.form}>

          {/* ── Display name (register only) ── */}
          {isRegister && (
            <div style={styles.field}>
              <label style={styles.label}>Display Name <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
                style={styles.input}
              />
            </div>
          )}

          {/* ── Email ── */}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="student@slhs.edu"
              required
              style={styles.input}
            />
          </div>

          {/* ── Password ── */}
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isRegister ? 'At least 6 characters' : '••••••••'}
              required
              minLength={isRegister ? 6 : undefined}
              style={styles.input}
            />
          </div>

          {/* ── Confirm password (register only) ── */}
          {isRegister && (
            <div style={styles.field}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                style={styles.input}
              />
            </div>
          )}

          {/* ── Divider + toggle for school portal ── */}
          <div style={styles.dividerRow}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>optional</span>
            <div style={styles.dividerLine} />
          </div>

          <button
            type="button"
            onClick={() => setShowHac(v => !v)}
            style={styles.toggleBtn}
          >
            {showHac ? '▲ Hide school portal' : '▼ Connect school portal (HAC)'}
          </button>

          {showHac && (
            <div style={styles.hacSection}>
              <div style={styles.field}>
                <label style={styles.label}>Portal URL</label>
                <input
                  type="url"
                  value={hacUrl}
                  onChange={e => setHacUrl(e.target.value)}
                  placeholder="https://homeaccess.katyisd.org/"
                  style={styles.input}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>HAC Username</label>
                <input
                  type="text"
                  value={hacUsername}
                  onChange={e => setHacUsername(e.target.value)}
                  placeholder="Your HAC username"
                  autoComplete="username"
                  style={styles.input}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>HAC Password</label>
                <input
                  type="password"
                  value={hacPassword}
                  onChange={e => setHacPassword(e.target.value)}
                  placeholder="Your HAC password"
                  autoComplete="current-password"
                  style={styles.input}
                />
              </div>
              <p style={styles.hint}>
                Your school credentials are never stored — they are only used to fetch your grades.
              </p>
              {hacError && <p style={styles.hacError}>⚠ {hacError} — you can connect later in Settings.</p>}
            </div>
          )}

          {/* ── Error / Success ── */}
          {error && <p style={styles.error}>{error}</p>}
          {success && <p style={styles.success}>{success}</p>}

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={isLoading}
            style={{ ...styles.btn, opacity: isLoading ? 0.6 : 1 }}
          >
            {btnLabel}
          </button>
        </form>

        {/* ── Mode switcher ── */}
        <p style={styles.switchText}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={switchMode}
            style={styles.switchLink}
          >
            {isRegister ? 'Log In' : 'Create one'}
          </button>
        </p>

        {/* ── Test hint (login only) ── */}
        {!isRegister && (
          <p style={styles.testHint}>
            Test: <code>test@nextstep.com</code> / <code>nextstep123</code>
          </p>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', padding: '20px',
  },
  card: {
    width: '100%', maxWidth: '420px', background: 'var(--surface)',
    border: '2px solid var(--border)', borderRadius: '16px', padding: '40px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  heading:    { fontSize: '32px', fontWeight: '700', color: 'var(--primary)', marginBottom: '6px' },
  subheading: { color: 'var(--text-secondary)', marginBottom: '28px' },
  form:       { width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' },
  field:      { display: 'flex', flexDirection: 'column', gap: '6px' },
  label:      { fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' },
  input: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '12px 14px', color: 'var(--text)', height: '48px', width: '100%', outline: 'none',
    boxSizing: 'border-box' as const,
  },
  dividerRow:  { display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' },
  dividerLine: { flex: 1, height: '1px', background: 'var(--border)' },
  dividerText: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  toggleBtn: {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
    color: 'var(--text-secondary)', fontSize: '13px', padding: '10px 14px',
    cursor: 'pointer', textAlign: 'left' as const, width: '100%',
  },
  hacSection: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' },
  hint:       { fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },
  error:      { color: 'var(--error)', fontSize: '14px' },
  success:    { color: 'var(--primary)', fontSize: '14px' },
  hacError:   { color: '#D29922', fontSize: '12px', lineHeight: 1.5 },
  btn: {
    background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: '8px',
    height: '48px', fontWeight: '600', fontSize: '15px', width: '100%', cursor: 'pointer',
    marginTop: '4px',
  },
  testHint: { marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' as const },
  switchText: { marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' as const },
  switchLink: {
    background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600', textDecoration: 'underline', padding: 0,
  },
}