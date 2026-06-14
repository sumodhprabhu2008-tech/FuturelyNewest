'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type StudentData } from '../../../lib/api'

function initials(name: string | null) {
  if (!name) return 'S'
  return name.trim().split(' ').map(p => p.charAt(0)).join('').slice(0, 2).toUpperCase()
}

type SystemType = 'HAC' | 'PowerSchool'
interface PortalStatus { connected: boolean; systemType: string | null; districtUrl: string | null; sessionExpiresIn: number; lastSynced: string | null }

export default function SettingsPage() {
  const router = useRouter()
  const [data, setData]                     = useState<StudentData | null>(null)
  const [portalStatus, setPortalStatus]     = useState<PortalStatus | null>(null)
  const [portalLoading, setPortalLoading]   = useState(true)
  const [portalSystem, setPortalSystem]     = useState<SystemType>('HAC')
  const [portalUrl, setPortalUrl]           = useState('https://homeaccess.katyisd.org/')
  const [portalUsername, setPortalUsername] = useState('')
  const [portalPassword, setPortalPassword] = useState('')
  const [portalConnecting, setPortalConnecting] = useState(false)
  const [portalError, setPortalError]       = useState<string | null>(null)
  const [syncing, setSyncing]             = useState(false)
  const [syncMsg, setSyncMsg]             = useState<string | null>(null)

  // Editable academic fields
  const [satScore, setSatScore]         = useState('')
  const [actScore, setActScore]         = useState('')
  const [futurePlan, setFuturePlan]     = useState('')
  const [saving, setSaving]             = useState(false)
  const [saveMsg, setSaveMsg]           = useState<string | null>(null)
  const [dirty, setDirty]               = useState(false)

  useEffect(() => {
    api.me().then(d => {
      setData(d)
      setSatScore(d.profile?.satScore?.toString() ?? '')
      setActScore(d.profile?.actScore?.toString() ?? '')
      setFuturePlan(d.profile?.futureDecision ?? '')
    }).catch(() => null)
    api.portalStatus().then(status => {
      setPortalStatus(status)
      if (!status.connected) {
        const saved = localStorage.getItem('ns_hac_url')
        if (saved) setPortalUrl(saved)
      }
      setPortalLoading(false)
    }).catch(() => setPortalLoading(false))
  }, [])

  function handleLogout() {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_user')
    router.push('/login')
  }

  async function handleConnect() {
    if (!portalUrl || !portalUsername || !portalPassword) { setPortalError('Please fill in all fields.'); return }
    setPortalConnecting(true); setPortalError(null)
    try {
      if (portalSystem === 'HAC') await api.portalLoginHAC(portalUrl, portalUsername, portalPassword)
      else await api.portalLoginPS(portalUrl, portalUsername, portalPassword)
      setPortalPassword(''); setPortalUsername('')
      const [status, fresh] = await Promise.all([api.portalStatus(), api.me()])
      setPortalStatus(status)
      setData(fresh)
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Connection failed')
    } finally { setPortalConnecting(false) }
  }

  async function handleDisconnect() {
    setPortalConnecting(true)
    try {
      await api.portalDisconnect()
      setPortalStatus({ connected: false, systemType: null, districtUrl: null, sessionExpiresIn: 0, lastSynced: null })
    } catch { /* ignore */ }
    finally { setPortalConnecting(false) }
  }

  async function handleSyncProfile() {
    setSyncing(true); setSyncMsg(null)
    try {
      const result = await api.portalSyncProfile()
      setSyncMsg('Profile synced from HAC!')
      // Refresh the user data to reflect the updated profile
      const fresh = await api.me()
      setData(fresh)
      setSatScore(fresh.profile?.satScore?.toString() ?? '')
      setActScore(fresh.profile?.actScore?.toString() ?? '')
      setFuturePlan(fresh.profile?.futureDecision ?? '')
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }

  async function handleSaveScores() {
    setSaving(true); setSaveMsg(null)
    const sat = satScore.trim() ? parseInt(satScore.trim(), 10) : null
    const act = actScore.trim() ? parseInt(actScore.trim(), 10) : null
    try {
      await api.updateProfile({
        satScore: sat,
        actScore: act,
        futureDecision: futurePlan.trim() || null,
      })
      setSaveMsg('Saved!')
      setDirty(false)
      const fresh = await api.me()
      setData(fresh)
    } catch {
      setSaveMsg('Failed to save')
    } finally { setSaving(false); setTimeout(() => setSaveMsg(null), 3000) }
  }

  const profile = data?.profile ?? null

  return (
    <div className="fade-up">
      <h1 style={S.title}>Settings</h1>

      <div style={S.layout}>
        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Profile card */}
          <div className="ns-card" style={S.profileCard}>
            <div style={S.avatar}>{initials(data?.name ?? null)}</div>
            <div>
              <div style={S.profileName}>{data?.name ?? 'Student'}</div>
              <div style={S.profileSub}>
                {[profile?.gradeLevel ? `Grade ${profile.gradeLevel}` : '', profile?.graduationYear ? `Class of ${profile.graduationYear}` : ''].filter(Boolean).join(' · ') || 'Student account'}
              </div>
            </div>
          </div>

          {/* Academic Info — editable */}
          <div className="ns-card" style={S.card}>
            <p style={S.cardLabel}>Academic Info</p>

            {/* SAT Score */}
            <div style={S.fieldRow}>
              <label style={S.fieldRowLabel}>SAT Score</label>
              <input
                className="ns-input"
                type="number"
                min={400} max={1600}
                placeholder="400–1600"
                value={satScore}
                onChange={e => { setSatScore(e.target.value); setDirty(true) }}
                style={S.inlineInput}
              />
            </div>

            {/* ACT Score */}
            <div style={S.fieldRow}>
              <label style={S.fieldRowLabel}>ACT Score</label>
              <input
                className="ns-input"
                type="number"
                min={1} max={36}
                placeholder="1–36"
                value={actScore}
                onChange={e => { setActScore(e.target.value); setDirty(true) }}
                style={S.inlineInput}
              />
            </div>

            {/* Future Plan */}
            <div style={S.fieldRow}>
              <label style={S.fieldRowLabel}>Future Plan</label>
              <input
                className="ns-input"
                type="text"
                placeholder="e.g. Computer Science at UT"
                value={futurePlan}
                onChange={e => { setFuturePlan(e.target.value); setDirty(true) }}
                style={S.inlineInput}
              />
            </div>

            {/* Counselor — read only, from HAC */}
            <InfoRow
              label="Counselor"
              value={profile?.counselorName ?? 'Unassigned'}
              sub={profile?.counselorName ? 'From school portal' : undefined}
            />

            {/* Graduation Year — read only, from HAC */}
            <InfoRow
              label="Graduation Year"
              value={profile?.graduationYear?.toString() ?? '—'}
              sub={profile?.graduationYear ? 'From school portal' : undefined}
            />

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="ns-btn-primary"
                style={{ height: 38, padding: '0 20px', fontSize: 13, opacity: dirty ? 1 : 0.5 }}
                onClick={handleSaveScores}
                disabled={saving || !dirty}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {saveMsg && (
                <span style={{ fontSize: 13, color: saveMsg === 'Saved!' ? '#22C55E' : 'var(--error)' }}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>

          {/* School Portal */}
          <div className="ns-card" style={S.card}>
            <p style={S.cardLabel}>School Portal</p>
            {portalLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
            ) : portalStatus?.connected ? (
              <div>
                <div style={S.connectedRow}>
                  <span style={S.connectedDot} />
                  <span style={S.connectedText}>Connected</span>
                  <span style={S.sysBadge}>{portalStatus.systemType}</span>
                </div>
                <p style={S.distUrl}>{portalStatus.districtUrl}</p>

                {/* Re-sync profile from HAC — refreshes counselor, graduation year, name */}
                {portalStatus.systemType === 'HAC' && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="ns-btn-ghost"
                      style={{
                        height: 36,
                        padding: '0 16px',
                        fontSize: 13,
                        color: 'var(--primary)',
                        borderColor: 'rgba(75,110,255,0.3)',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                      onClick={handleSyncProfile}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <>
                          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                          Syncing…
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 2v6h-6"/>
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                            <path d="M3 22v-6h6"/>
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                          </svg>
                          Re-sync from HAC
                        </>
                      )}
                    </button>
                    {syncMsg && (
                      <p style={{
                        fontSize: 12,
                        color: syncMsg.includes('fail') || syncMsg.includes('Error') ? 'var(--error)' : '#22C55E',
                        marginTop: 6,
                        textAlign: 'center',
                      }}>
                        {syncMsg}
                      </p>
                    )}
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                      Fetches counselor & graduation year from your school portal
                    </p>
                  </div>
                )}

                <button className="ns-btn-ghost" style={{ ...S.disconnectBtn, marginTop: 14 }}
                  onClick={handleDisconnect} disabled={portalConnecting}>
                  {portalConnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={S.sysToggle}>
                  {(['HAC', 'PowerSchool'] as SystemType[]).map(s => (
                    <button key={s} onClick={() => { setPortalSystem(s); setPortalUrl(s === 'HAC' ? 'https://homeaccess.katyisd.org/' : ''); setPortalError(null) }}
                      style={{ ...S.sysBtn, background: portalSystem === s ? 'var(--primary)' : 'transparent', color: portalSystem === s ? '#060D10' : 'var(--text-secondary)' }}>
                      {s}
                    </button>
                  ))}
                </div>
                {[
                  { label: 'Portal URL', value: portalUrl, onChange: setPortalUrl, type: 'url', placeholder: 'https://', ac: '' },
                  { label: 'Username',   value: portalUsername, onChange: setPortalUsername, type: 'text', placeholder: 'Your school username', ac: 'username' },
                  { label: 'Password',   value: portalPassword, onChange: setPortalPassword, type: 'password', placeholder: 'Your school password', ac: 'current-password' },
                ].map(f => (
                  <div key={f.label}>
                    <label style={S.fieldLabel}>{f.label}</label>
                    <input className="ns-input" type={f.type} value={f.value} onChange={e => f.onChange(e.target.value)}
                      placeholder={f.placeholder} disabled={portalConnecting} autoComplete={f.ac} />
                  </div>
                ))}
                {portalError && <p style={{ color: 'var(--error)', fontSize: 12.5, lineHeight: 1.4 }}>{portalError}</p>}
                <button className="ns-btn-primary" style={{ height: 44, marginTop: 2 }} onClick={handleConnect} disabled={portalConnecting}>
                  {portalConnecting ? 'Connecting…' : 'Connect Portal'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ns-card" style={S.card}>
            <p style={S.cardLabel}>Appearance</p>
            <InfoRow label="Theme" value="Dark" />
            <InfoRow label="Grade color coding" value="Enabled" />
          </div>

          <div className="ns-card" style={S.card}>
            <p style={S.cardLabel}>Support</p>
            <InfoRow label="Contact" value="support@nextstep.ai" />
            <InfoRow label="Version" value="v1.0 MVP" />
          </div>

          <button style={S.logoutBtn} onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ textAlign: 'right' as const }}>
        <span style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 500 }}>{value}</span>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  title:        { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 24 },
  layout:       { display: 'flex', gap: 20, alignItems: 'flex-start' },
  profileCard:  { display: 'flex', alignItems: 'center', gap: 16, padding: 20, marginBottom: 16 },
  avatar:       { width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#4B6EFF,#00C896)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 },
  profileName:  { fontSize: 17, fontWeight: 700 },
  profileSub:   { fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 },
  card:         { padding: 20, marginBottom: 16 },
  cardLabel:    { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 14 },
  fieldRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 },
  fieldRowLabel:{ fontSize: 13.5, color: 'var(--text-secondary)', flexShrink: 0, margin: 0 },
  inlineInput:  { width: 160, textAlign: 'right' as const, padding: '5px 10px', fontSize: 13.5, height: 34 },
  connectedRow: { display: 'flex', alignItems: 'center', gap: 8 },
  connectedDot: { width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0 },
  connectedText:{ color: '#22C55E', fontWeight: 600, fontSize: 14 },
  sysBadge:     { fontSize: 11, color: 'var(--text-secondary)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px' },
  distUrl:      { fontSize: 12, color: 'var(--text-muted)', marginTop: 6 },
  disconnectBtn:{ color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)', fontSize: 13 },
  sysToggle:    { display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' },
  sysBtn:       { flex: 1, borderRadius: 6, padding: '7px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'background 0.15s, color 0.15s' },
  fieldLabel:   { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 },
  logoutBtn:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 0', color: 'var(--error)', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
}
