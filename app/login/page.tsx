'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../lib/api'

type Mode = 'login' | 'register-student' | 'register-parent'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')

  const [email, setEmail]                   = useState('')
  const [password, setPassword]             = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName]                     = useState('')

  // HAC (student registration only)
  const [hacUrl, setHacUrl]           = useState('https://homeaccess.katyisd.org/')
  const [hacUsername, setHacUsername] = useState('')
  const [hacPassword, setHacPassword] = useState('')

  const [error, setError]       = useState<string | null>(null)
  const [hacError, setHacError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep]         = useState<'auth' | 'connecting' | 'syncing'>('auth')

  // Shown after login if student portal session has expired
  const [portalDisconnected, setPortalDisconnected] = useState(false)

  function reset() {
    setError(null)
    setHacError(null)
    setPortalDisconnected(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    reset()

    if (mode !== 'login') {
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
      if (password.length < 6)          { setError('Password must be at least 6 characters'); return }
      if (mode === 'register-student' && (!hacUsername.trim() || !hacPassword.trim() || !hacUrl.trim())) {
        setError('School portal credentials are required to create a student account')
        return
      }
    }

    setIsLoading(true)

    try {
      let result: { token: string; user: { id: number; name: string | null; role: string } }

      if (mode === 'login') {
        result = await api.login(email, password)
      } else if (mode === 'register-student') {
        result = await api.register(email, password, name.trim() || undefined)
      } else {
        result = await api.register(email, password, name.trim() || undefined, 'PARENT')
      }

      localStorage.setItem('ns_token', result.token)
      localStorage.setItem('ns_user', JSON.stringify(result.user))

      // Student registration: connect school portal
      if (mode === 'register-student') {
        setStep('connecting')
        try {
          await api.portalLoginHAC(hacUrl.trim(), hacUsername.trim(), hacPassword.trim())
          localStorage.setItem('ns_hac_url', hacUrl.trim())
        } catch (hacErr) {
          setHacError(hacErr instanceof Error ? hacErr.message : 'School portal connection failed')
          await new Promise(r => setTimeout(r, 2000))
        }
      }

      // Student login: background portal sync to detect expired sessions
      if (mode === 'login' && result.user.role !== 'PARENT') {
        setStep('syncing')
        try {
          const status = await api.portalStatus()
          if (status.connected) {
            await api.portalGrades()
          }
        } catch (syncErr) {
          const msg = syncErr instanceof Error ? syncErr.message : ''
          if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('school')) {
            setPortalDisconnected(true)
            await new Promise(r => setTimeout(r, 2500))
          }
        }
      }

      if (result.user.role === 'PARENT') {
        router.push('/parent/dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'login' ? 'Login failed' : 'Registration failed')
    } finally {
      setIsLoading(false)
      setStep('auth')
    }
  }

  const btnLabel = isLoading
    ? step === 'connecting' ? 'Connecting to school portal...'
    : step === 'syncing'    ? 'Syncing grades...'
    : mode === 'login'      ? 'Logging in...'
    : 'Creating account...'
    : mode === 'login'      ? 'Log In'
    : 'Create Account'

  const headingText =
    mode === 'login'             ? 'Your academic companion' :
    mode === 'register-parent'   ? 'Create a parent account' :
                                   'Create your student account'

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/"><img src="/logo.jpg" alt="NextStep" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 16 }} /></a>
        <h1 style={styles.heading}>NextStep</h1>
        <p style={styles.subheading}>{headingText}</p>

        {/* Portal disconnected toast */}
        {portalDisconnected && (
          <div style={styles.toastWarn}>
            Your school portal session has expired. Reconnect it in Settings after logging in.
          </div>
        )}

        <form onSubmit={e => void handleSubmit(e)} style={styles.form}>

          {/* Name (register only) */}
          {mode !== 'login' && (
            <div style={styles.field}>
              <label style={styles.label}>
                {mode === 'register-parent' ? 'Your Name' : 'Display Name'}{' '}
                {mode === 'register-student' && <span style={{ color: 'var(--text-muted)' }}>(optional)</span>}
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder={mode === 'register-parent' ? 'Jane Smith' : 'Jane Doe'}
                required={mode === 'register-parent'} style={styles.input} />
            </div>
          )}

          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required style={styles.input} />
          </div>

          {/* Password */}
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode !== 'login' ? 'At least 6 characters' : '••••••••'}
              required minLength={mode !== 'login' ? 6 : undefined} style={styles.input} />
          </div>

          {/* Confirm password (register only) */}
          {mode !== 'login' && (
            <div style={styles.field}>
              <label style={styles.label}>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password" required style={styles.input} />
            </div>
          )}

          {/* School portal (student registration only) */}
          {mode === 'register-student' && (
            <>
              <div style={styles.dividerRow}>
                <div style={styles.dividerLine} />
                <span style={styles.dividerText}>required — school portal</span>
                <div style={styles.dividerLine} />
              </div>
              <div style={styles.hacSection}>
                <div style={styles.field}>
                  <label style={styles.label}>Portal URL</label>
                  <input type="url" value={hacUrl} onChange={e => setHacUrl(e.target.value)}
                    placeholder="https://homeaccess.katyisd.org/" style={styles.input} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>HAC Username</label>
                  <input type="text" value={hacUsername} onChange={e => setHacUsername(e.target.value)}
                    placeholder="Your HAC username" autoComplete="username" style={styles.input} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>HAC Password</label>
                  <input type="password" value={hacPassword} onChange={e => setHacPassword(e.target.value)}
                    placeholder="Your HAC password" autoComplete="current-password" style={styles.input} />
                </div>
                <p style={styles.hint}>Your school credentials are never stored — used only to fetch grades.</p>
                {hacError && <p style={styles.hacError}>⚠ {hacError} — you can reconnect later in Settings.</p>}
              </div>
            </>
          )}

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={isLoading}
            style={{ ...styles.btn, opacity: isLoading ? 0.6 : 1 }}>
            {btnLabel}
          </button>
        </form>

        {/* Mode switcher */}
        {mode === 'login' && (
          <>
            <p style={styles.switchText}>
              Don&apos;t have an account?{' '}
              <button type="button" onClick={() => { setMode('register-student'); reset() }} style={styles.switchLink}>
                Create one
              </button>
            </p>
            <p style={{ ...styles.switchText, marginTop: 4 }}>
              Parent or guardian?{' '}
              <button type="button" onClick={() => { setMode('register-parent'); reset() }} style={styles.switchLink}>
                Create a parent account
              </button>
            </p>
            <p style={styles.testHint}>
              Test: <code>test@nextstep.com</code> / <code>nextstep123</code>
            </p>
          </>
        )}

        {mode === 'register-student' && (
          <>
            <p style={styles.switchText}>
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); reset() }} style={styles.switchLink}>Log In</button>
            </p>
            <p style={styles.switchText}>
              Parent or guardian?{' '}
              <button type="button" onClick={() => { setMode('register-parent'); reset() }} style={styles.switchLink}>
                Create a parent account instead
              </button>
            </p>
          </>
        )}

        {mode === 'register-parent' && (
          <p style={styles.switchText}>
            Already have an account?{' '}
            <button type="button" onClick={() => { setMode('login'); reset() }} style={styles.switchLink}>Log In</button>
            {' · '}
            <button type="button" onClick={() => { setMode('register-student'); reset() }} style={styles.switchLink}>Student account</button>
          </p>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:       { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 },
  card:       { width: '100%', maxWidth: 420, background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 16, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  heading:    { fontSize: 32, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 },
  subheading: { color: 'var(--text-secondary)', marginBottom: 24, textAlign: 'center' },
  form:       { width: '100%', display: 'flex', flexDirection: 'column', gap: 14 },
  field:      { display: 'flex', flexDirection: 'column', gap: 6 },
  label:      { fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' },
  input:      { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', color: 'var(--text)', height: 48, width: '100%', outline: 'none', boxSizing: 'border-box' as const },
  dividerRow: { display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' },
  dividerLine:{ flex: 1, height: 1, background: 'var(--border)' },
  dividerText:{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  hacSection: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' },
  hint:       { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },
  error:      { color: 'var(--error)', fontSize: 14 },
  hacError:   { color: '#D29922', fontSize: 12, lineHeight: 1.5 },
  btn:        { background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: 8, height: 48, fontWeight: 600, fontSize: 15, width: '100%', cursor: 'pointer', marginTop: 4 },
  testHint:   { marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' as const },
  switchText: { marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' as const },
  switchLink: { background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, textDecoration: 'underline', padding: 0 },
  toastWarn:  { width: '100%', background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.4)', borderRadius: 8, padding: '10px 14px', color: '#D29922', fontSize: 13, lineHeight: 1.5, marginBottom: 8, textAlign: 'center' as const },
}
