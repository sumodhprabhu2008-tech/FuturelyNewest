'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { api } from '../../lib/api'
import { SORTED_ISD_LIST, type ISDEntry } from '../../lib/isds'

type Mode = 'login' | 'register-student' | 'register-parent'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')

  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName]                       = useState('')

  const [hacUrl, setHacUrl]           = useState('')
  const [hacUsername, setHacUsername] = useState('')
  const [hacPassword, setHacPassword] = useState('')

  const [selectedIsd, setSelectedIsd]     = useState<ISDEntry | null>(null)
  const [isdSearch, setIsdSearch]         = useState('')
  const [isdOpen, setIsdOpen]             = useState(false)
  const [useCustomUrl, setUseCustomUrl]   = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [error, setError]     = useState<string | null>(null)
  const [hacError, setHacError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep]       = useState<'auth' | 'connecting' | 'syncing'>('auth')
  const [portalDisconnected, setPortalDisconnected] = useState(false)

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsdOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  const filteredIsds = SORTED_ISD_LIST.filter(isd =>
    isd.name.toLowerCase().includes(isdSearch.toLowerCase()) ||
    isd.state.toLowerCase().includes(isdSearch.toLowerCase())
  )

  function selectIsd(isd: ISDEntry) {
    setSelectedIsd(isd); setHacUrl(isd.hacUrl); setUseCustomUrl(false); setIsdSearch(''); setIsdOpen(false)
  }
  function selectOther() {
    setSelectedIsd(null); setHacUrl(''); setUseCustomUrl(true); setIsdSearch(''); setIsdOpen(false)
  }
  function reset() { setError(null); setHacError(null); setPortalDisconnected(false) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    reset()
    if (mode !== 'login') {
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
      if (password.length < 6)          { setError('Password must be at least 6 characters'); return }
      if (mode === 'register-student') {
        if (!hacUsername.trim() || !hacPassword.trim()) { setError('School portal credentials are required'); return }
        if (!hacUrl.trim()) { setError('Please select your school district'); return }
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
      if (mode === 'login' && result.user.role !== 'PARENT') {
        setStep('syncing')
        try {
          const status = await api.portalStatus()
          if (status.connected) await api.portalGrades()
        } catch (syncErr) {
          const msg = syncErr instanceof Error ? syncErr.message : ''
          if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('school')) {
            setPortalDisconnected(true)
            await new Promise(r => setTimeout(r, 2500))
          }
        }
      }
      router.push(result.user.role === 'PARENT' ? '/parent/dashboard' : '/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'login' ? 'Login failed' : 'Registration failed')
    } finally { setIsLoading(false); setStep('auth') }
  }

  const btnLabel = isLoading
    ? step === 'connecting' ? 'Connecting to school portal...'
    : step === 'syncing'    ? 'Syncing grades...'
    : mode === 'login'      ? 'Logging in...'
    : 'Creating account...'
    : mode === 'login'      ? 'Log In'
    : 'Create Account'

  const headingText =
    mode === 'login'           ? 'Your academic companion' :
    mode === 'register-parent' ? 'Create a parent account' :
                                 'Create your student account'

  const isdDisplayLabel = useCustomUrl ? 'Other / Not Listed' : selectedIsd ? `${selectedIsd.name} (${selectedIsd.state})` : ''

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={{ marginBottom: 18 }}>
          <Image src="/logo.svg" alt="NextStep" width={48} height={48} />
        </div>
        <h1 style={styles.heading}>NextStep</h1>
        <p style={styles.subheading}>{headingText}</p>

        {portalDisconnected && (
          <div style={styles.toastWarn}>
            Your school portal session has expired. Reconnect it in Settings after logging in.
          </div>
        )}

        <form onSubmit={e => void handleSubmit(e)} style={styles.form}>
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

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required style={styles.input} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode !== 'login' ? 'At least 6 characters' : '••••••••'}
              required minLength={mode !== 'login' ? 6 : undefined} style={styles.input} />
          </div>

          {mode !== 'login' && (
            <div style={styles.field}>
              <label style={styles.label}>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password" required style={styles.input} />
            </div>
          )}

          {mode === 'register-student' && (
            <>
              <div style={styles.dividerRow}>
                <div style={styles.dividerLine} />
                <span style={styles.dividerText}>required — school portal</span>
                <div style={styles.dividerLine} />
              </div>
              <div style={styles.hacSection}>
                {/* ISD Dropdown */}
                <div style={styles.field}>
                  <label style={styles.label}>School District</label>
                  <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <button type="button" onClick={() => { setIsdOpen(v => !v); setIsdSearch('') }}
                      style={{ ...styles.input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left', background: 'var(--bg)', color: isdDisplayLabel ? 'var(--text)' : 'var(--text-muted)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isdDisplayLabel || 'Search for your school district...'}
                      </span>
                      <span style={{ fontSize: 12, marginLeft: 8, flexShrink: 0 }}>{isdOpen ? '▲' : '▼'}</span>
                    </button>
                    {isdOpen && (
                      <div style={styles.dropdownPanel}>
                        <div style={{ padding: '8px 8px 4px' }}>
                          <input autoFocus type="text" value={isdSearch} onChange={e => setIsdSearch(e.target.value)}
                            placeholder="Type to search..." style={{ ...styles.input, height: 36, fontSize: 13, padding: '6px 10px' }}
                            onClick={e => e.stopPropagation()} />
                        </div>
                        <div style={styles.dropdownList}>
                          {filteredIsds.length === 0 ? (
                            <div style={styles.dropdownEmpty}>No districts found</div>
                          ) : filteredIsds.map(isd => (
                            <button key={isd.hacUrl} type="button"
                              style={{ ...styles.dropdownItem, background: selectedIsd?.hacUrl === isd.hacUrl ? 'rgba(0,200,150,0.12)' : 'transparent', color: selectedIsd?.hacUrl === isd.hacUrl ? 'var(--primary)' : 'var(--text)' }}
                              onClick={() => selectIsd(isd)}>
                              <span style={{ fontWeight: 500 }}>{isd.name}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{isd.state}</span>
                            </button>
                          ))}
                          <div style={styles.dropdownDivider} />
                          <button type="button"
                            style={{ ...styles.dropdownItem, background: useCustomUrl ? 'rgba(0,200,150,0.12)' : 'transparent', color: useCustomUrl ? 'var(--primary)' : 'var(--text-secondary)', fontStyle: 'italic' }}
                            onClick={selectOther}>
                            Other / My district is not listed
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {useCustomUrl && (
                  <div style={styles.field}>
                    <label style={styles.label}>Portal URL</label>
                    <input type="url" value={hacUrl} onChange={e => setHacUrl(e.target.value)}
                      placeholder="https://homeaccess.yourisd.org/" style={styles.input} required />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Enter the base URL of your school&apos;s Home Access Center portal.</span>
                  </div>
                )}

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

          <button type="submit" disabled={isLoading} style={{ ...styles.btn, opacity: isLoading ? 0.6 : 1 }}>
            {btnLabel}
          </button>
        </form>

        {mode === 'login' && (
          <>
            <p style={styles.switchText}>
              Don&apos;t have an account?{' '}
              <button type="button" onClick={() => { setMode('register-student'); reset() }} style={styles.switchLink}>Create one</button>
            </p>
            <p style={{ ...styles.switchText, marginTop: 4 }}>
              Parent or guardian?{' '}
              <button type="button" onClick={() => { setMode('register-parent'); reset() }} style={styles.switchLink}>Create a parent account</button>
            </p>
            <p style={styles.testHint}>Test: <code>test@nextstep.com</code> / <code>nextstep123</code></p>
          </>
        )}

        {mode === 'register-student' && (
          <>
            <p style={styles.switchText}>Already have an account?{' '}<button type="button" onClick={() => { setMode('login'); reset() }} style={styles.switchLink}>Log In</button></p>
            <p style={styles.switchText}>Parent or guardian?{' '}<button type="button" onClick={() => { setMode('register-parent'); reset() }} style={styles.switchLink}>Create a parent account instead</button></p>
          </>
        )}

        {mode === 'register-parent' && (
          <p style={styles.switchText}>
            Already have an account?{' '}<button type="button" onClick={() => { setMode('login'); reset() }} style={styles.switchLink}>Log In</button>
            {' · '}<button type="button" onClick={() => { setMode('register-student'); reset() }} style={styles.switchLink}>Student account</button>
          </p>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:            { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 },
  card:            { width: '100%', maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '44px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 60px rgba(0,200,150,0.04), 0 24px 48px rgba(0,0,0,0.25)' },
  heading:         { fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', background: 'linear-gradient(135deg,#4B6EFF,#00C896)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 6 },
  subheading:      { color: 'var(--text-secondary)', marginBottom: 28, textAlign: 'center', fontSize: 14 },
  form:            { width: '100%', display: 'flex', flexDirection: 'column', gap: 14 },
  field:           { display: 'flex', flexDirection: 'column', gap: 6 },
  label:           { fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1px' },
  input:           { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', color: 'var(--text)', height: 46, width: '100%', outline: 'none', boxSizing: 'border-box' as const, fontSize: 14, transition: 'border-color 0.15s' },
  dividerRow:      { display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' },
  dividerLine:     { flex: 1, height: 1, background: 'var(--border)' },
  dividerText:     { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.7px', fontWeight: 600 },
  hacSection:      { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' },
  hint:            { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },
  error:           { color: 'var(--error)', fontSize: 13.5, lineHeight: 1.4 },
  hacError:        { color: '#D29922', fontSize: 12, lineHeight: 1.5 },
  btn:             { background: 'var(--primary)', color: '#060D10', border: 'none', borderRadius: 9, height: 48, fontWeight: 700, fontSize: 15, width: '100%', cursor: 'pointer', marginTop: 4, letterSpacing: '0.1px' },
  testHint:        { marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' as const },
  switchText:      { marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' as const },
  switchLink:      { background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 },
  toastWarn:       { width: '100%', background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.3)', borderRadius: 8, padding: '10px 14px', color: '#D29922', fontSize: 13, lineHeight: 1.5, marginBottom: 10, textAlign: 'center' as const },
  dropdownPanel:   { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.35)', marginTop: 4, overflow: 'hidden' },
  dropdownList:    { maxHeight: 220, overflowY: 'auto' as const, padding: '4px 8px 8px' },
  dropdownItem:    { display: 'flex', alignItems: 'center', width: '100%', padding: '9px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left' as const, transition: 'background 0.1s' },
  dropdownEmpty:   { padding: '12px 10px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' as const },
  dropdownDivider: { height: 1, background: 'var(--border)', margin: '4px 0' },
}
