'use client'

import { useEffect, useState } from 'react'
import { api, InventoryData, BoxResult, MarketplaceItem } from '../../../lib/api'

const RARITY_COLOR: Record<string, string> = {
  Common: '#6B7280', Uncommon: '#3B82F6', Rare: '#8B5CF6',
  Epic: '#F97316', Legendary: '#EAB308', Mythic: '#EC4899',
}

const PFP_BORDER_MAP: Record<string, string> = {
  'border-green': '#22C55E', 'border-blue': '#3B82F6', 'border-red': '#EF4444',
  'border-navy': '#1D4ED8', 'border-teal': '#14B8A6', 'border-orange': '#F97316',
  'border-violet': '#7C3AED', 'border-cyan': '#06B6D4', 'border-hotpink': '#EC4899',
  'border-gold': '#D97706', 'border-lime': '#84CC16',
}
const PFP_GLOW_MAP: Record<string, [string, string]> = {
  'glow-pink':   ['#EC4899', '#EC489955'],
  'glow-purple': ['#8B5CF6', '#8B5CF655'],
}
function pfpStyle(effect: string | null | undefined): React.CSSProperties {
  if (!effect) return {}
  if (effect === 'rainbow') return { background: '#ff0000', border: '3px solid #ff0000', boxShadow: '0 0 14px #ff000088', color: '#fff' }
  if (effect === 'glow-gold')   return { background: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#000', border: '2px solid #D97706' }
  if (effect === 'frame-black') return { background: '#0d0d0d', color: '#4B5563', border: '2px solid #1F2937' }
  if (PFP_BORDER_MAP[effect]) return { border: `2px solid ${PFP_BORDER_MAP[effect]}` }
  if (PFP_GLOW_MAP[effect]) return { border: `2px solid ${PFP_GLOW_MAP[effect][0]}`, boxShadow: `0 0 12px ${PFP_GLOW_MAP[effect][1]}` }
  return {}
}
function pfpClass(effect: string | null | undefined): string {
  return effect === 'rainbow' ? 'pfp-rainbow' : ''
}

type DropGroup = { rarity: string; pct: string; items: string[] }

const BOX_DEFS: { type: 'tag' | 'name-color' | 'pfp'; icon: string; label: string; desc: string; drops: DropGroup[] }[] = [
  {
    type: 'tag', icon: '📦', label: 'Tag Box', desc: 'Win exclusive profile tags',
    drops: [
      { rarity: 'Common',    pct: '60%',   items: ['Grinder', 'Focused', 'Scholar'] },
      { rarity: 'Uncommon',  pct: '25%',   items: ['Honors Student', 'AP Student'] },
      { rarity: 'Rare',      pct: '10%',   items: ["Dean's List", 'Top Performer'] },
      { rarity: 'Epic',      pct: '4%',    items: ['Ace', 'Prodigy'] },
      { rarity: 'Legendary', pct: '1%',    items: ['Mastermind', 'Genius'] },
      { rarity: 'Mythic',    pct: '0.5%',  items: ['GOAT'] },
    ],
  },
  {
    type: 'name-color', icon: '🎨', label: 'Name Color Box', desc: 'Colorize your display name',
    drops: [
      { rarity: 'Common',    pct: '60%',    items: ['Forest Green', 'Navy Blue', 'Dark Red', 'Slate Blue', 'Teal'] },
      { rarity: 'Uncommon',  pct: '24.99%', items: ['Bright Orange', 'Violet', 'Cyan'] },
      { rarity: 'Rare',      pct: '10%',    items: ['Hot Pink', 'Gold', 'Lime Green'] },
      { rarity: 'Epic',      pct: '4%',     items: ['Electric Blue', 'Magenta'] },
      { rarity: 'Legendary', pct: '1%',     items: ['Pure White', 'Black'] },
      { rarity: 'Mythic',    pct: '0.01%',  items: ['Rainbow RGB ✨'] },
    ],
  },
  {
    type: 'pfp', icon: '🖼️', label: 'Profile Picture Box', desc: 'Apply effects to your avatar',
    drops: [
      { rarity: 'Common',    pct: '60%',    items: ['Green Border', 'Blue Border', 'Red Border', 'Navy Border', 'Teal Border'] },
      { rarity: 'Uncommon',  pct: '24.99%', items: ['Orange Border', 'Violet Border', 'Cyan Border'] },
      { rarity: 'Rare',      pct: '10%',    items: ['Hot Pink Border', 'Gold Border', 'Lime Border'] },
      { rarity: 'Epic',      pct: '4%',     items: ['Pink Glow', 'Purple Glow'] },
      { rarity: 'Legendary', pct: '1%',     items: ['Gold Fill', 'Void Fill'] },
      { rarity: 'Mythic',    pct: '0.01%',  items: ['Rainbow Animated ✨'] },
    ],
  },
]

export default function MarketplacePage() {
  const [inv, setInv] = useState<InventoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState<'tag' | 'name-color' | 'pfp' | null>(null)
  const [hoveredBox, setHoveredBox] = useState<'tag' | 'name-color' | 'pfp' | null>(null)
  const [result, setResult] = useState<(BoxResult & { dismissed?: boolean }) | null>(null)
  const [equipping, setEquipping] = useState<string | null>(null)
  const [isDevUser, setIsDevUser] = useState(false)
  const [devCoins, setDevCoins] = useState('500')
  const [devType, setDevType] = useState<'name-color' | 'pfp'>('name-color')
  const [devItemId, setDevItemId] = useState('')
  const [devGranting, setDevGranting] = useState(false)
  const [devMsg, setDevMsg] = useState('')

  useEffect(() => {
    api.marketplaceInventory()
      .then(d => { setInv(d); setLoading(false) })
      .catch(() => setLoading(false))

    // Check if DEV user
    try {
      const token = localStorage.getItem('ns_token')
      if (token) {
        const uid = JSON.parse(atob(token.split('.')[1])).sub
        if (uid) {
          api.feedUserProfile(uid)
            .then(p => setIsDevUser(p.role === 'DEV' || p.role === 'ADMIN' || p.tag === 'DEV'))
            .catch(() => {})
        }
      }
    } catch { /* ignore */ }
  }, [])

  async function handleDailyClaim() {
    try {
      const r = await api.marketplaceDailyClaim()
      setInv(prev => prev ? { ...prev, coins: r.coins, canClaimToday: false } : prev)
    } catch { /* ignore */ }
  }

  async function handleOpenBox(boxType: 'tag' | 'name-color' | 'pfp') {
    if (opening || !inv || inv.coins < 10) return
    setOpening(boxType); setResult(null)
    try {
      const r = await api.marketplaceOpenBox(boxType)
      setInv(prev => {
        if (!prev) return prev
        const next = { ...prev, coins: r.coins }
        if (boxType === 'name-color' && r.won.value) {
          const item: MarketplaceItem = { id: r.won.id, name: r.won.name ?? r.won.id, value: r.won.value, rarity: r.won.rarity, weight: 0 }
          next.ownedNameColors = prev.ownedNameColors.some(i => i.id === r.won.id) ? prev.ownedNameColors : [...prev.ownedNameColors, item]
        }
        if (boxType === 'pfp' && r.won.value) {
          const item: MarketplaceItem = { id: r.won.id, name: r.won.name ?? r.won.id, value: r.won.value, rarity: r.won.rarity, weight: 0 }
          next.ownedPfpEffects = prev.ownedPfpEffects.some(i => i.id === r.won.id) ? prev.ownedPfpEffects : [...prev.ownedPfpEffects, item]
        }
        return next
      })
      setResult(r)
    } catch { /* ignore */ }
    finally { setOpening(null) }
  }

  async function handleEquip(type: 'name-color' | 'pfp', itemId: string | null) {
    if (equipping || !inv) return
    setEquipping(type + (itemId ?? 'null'))
    try {
      await api.marketplaceEquip(type, itemId)
      setInv(prev => {
        if (!prev) return prev
        if (type === 'name-color') {
          return { ...prev, nameColor: itemId ? prev.ownedNameColors.find(i => i.id === itemId)?.value ?? null : null }
        }
        return { ...prev, pfpEffect: itemId ? prev.ownedPfpEffects.find(i => i.id === itemId)?.value ?? null : null }
      })
    } catch { /* ignore */ }
    finally { setEquipping(null) }
  }

  async function handleDevGrant(grantType: 'coins' | 'name-color' | 'pfp') {
    if (devGranting) return
    setDevGranting(true); setDevMsg('')
    try {
      if (grantType === 'coins') {
        const amount = parseInt(devCoins)
        if (isNaN(amount) || amount <= 0) { setDevMsg('Enter a valid amount'); return }
        const r = await api.marketplaceAdminGrant({ type: 'coins', amount })
        setInv(prev => prev ? { ...prev, coins: r.coins ?? prev.coins } : prev)
        setDevMsg(`✓ Granted ${amount} coins`)
      } else {
        if (!devItemId.trim()) { setDevMsg('Enter an item ID'); return }
        const r = await api.marketplaceAdminGrant({ type: grantType === 'name-color' ? 'name-color' : 'pfp', itemId: devItemId.trim() })
        setDevMsg(`✓ Granted: ${r.granted?.name}`)
        const fresh = await api.marketplaceInventory()
        setInv(fresh)
      }
    } catch { setDevMsg('Grant failed') }
    finally { setDevGranting(false) }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--text-muted)', fontSize: 13 }}>
        Loading marketplace…
      </div>
    )
  }

  return (
    <div className="fade-up" style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>Spend your coins</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)' }}>Marketplace</h1>
      </div>

      {/* Coin balance */}
      <div className="ns-card" style={{ padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 6 }}>Your Balance</p>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#EAB308', letterSpacing: '-0.5px' }}>🪙 {inv?.coins?.toLocaleString() ?? 0}</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>+50 coins every day you log in</p>
        </div>
        {inv?.canClaimToday ? (
          <button onClick={handleDailyClaim} style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: '#EAB308', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Claim 50 🪙
          </button>
        ) : (
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontSize: 20 }}>✓</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>Claimed today</div>
          </div>
        )}
      </div>

      {/* Box result */}
      {result && !result.dismissed && (
        <div className="ns-card box-pop" style={{ padding: 24, marginBottom: 20, textAlign: 'center', border: `1px solid ${RARITY_COLOR[result.won.rarity] ?? 'var(--border)'}55`, background: `${RARITY_COLOR[result.won.rarity] ?? '#000'}08` }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>You won!</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: RARITY_COLOR[result.won.rarity] ?? 'var(--text)', marginBottom: 4 }}>
            {result.won.name ?? result.won.tag}
          </div>
          <div style={{ fontSize: 13, color: RARITY_COLOR[result.won.rarity] ?? 'var(--text-muted)', fontWeight: 700, marginBottom: 16 }}>
            {result.won.rarity}{result.alreadyHad ? ' · already owned' : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {result.won.type !== 'tag' && (
              <button
                onClick={() => { void handleEquip(result.won.type === 'name-color' ? 'name-color' : 'pfp', result.won.id) }}
                style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#060D10', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Equip Now
              </button>
            )}
            <button
              onClick={() => setResult(r => r ? { ...r, dismissed: true } : r)}
              style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Nice!
            </button>
          </div>
        </div>
      )}

      {/* Boxes */}
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 12 }}>Open a Box — 10 🪙 each</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {BOX_DEFS.map(box => {
          const isHovered = hoveredBox === box.type
          return (
            <div
              key={box.type}
              className="ns-card"
              onMouseEnter={() => setHoveredBox(box.type)}
              onMouseLeave={() => setHoveredBox(null)}
              style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, transition: 'border-color 0.15s' }}
            >
              <div style={{ fontSize: 38 }}>{box.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{box.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{box.desc}</div>
              <button
                onClick={() => void handleOpenBox(box.type)}
                disabled={!inv || inv.coins < 10 || !!opening}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 9, border: 'none',
                  background: opening === box.type ? 'var(--surface-2)' : 'var(--primary)',
                  color: opening === box.type ? 'var(--text-muted)' : '#060D10',
                  fontWeight: 700, fontSize: 13, marginTop: 4,
                  cursor: inv && inv.coins >= 10 && !opening ? 'pointer' : 'not-allowed',
                  opacity: !inv || inv.coins < 10 ? 0.45 : 1,
                }}
              >
                {opening === box.type ? 'Opening…' : '🎁 Open Box'}
              </button>

              {/* Drop table — shown on hover */}
              {isHovered && (
                <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-muted)', marginBottom: 2 }}>Drop Rates</div>
                  {box.drops.map(group => (
                    <div key={group.rarity} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: RARITY_COLOR[group.rarity], minWidth: 36, paddingTop: 1 }}>{group.pct}</span>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: RARITY_COLOR[group.rarity] }}>{group.rarity} </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{group.items.join(' · ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Inventory */}
      {((inv?.ownedNameColors ?? []).length > 0 || (inv?.ownedPfpEffects ?? []).length > 0) && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 12 }}>Your Inventory</p>

          {(inv?.ownedNameColors ?? []).length > 0 && (
            <div className="ns-card" style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>🎨 Name Colors</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {inv!.ownedNameColors.map(item => {
                  const isEquipped = inv!.nameColor === item.value
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: '1px solid var(--border)', background: item.value === 'rainbow' ? 'linear-gradient(135deg,#ff6b6b,#ffd43b,#69db7c,#4dabf7)' : item.value }} />
                      <span className={item.value === 'rainbow' ? 'name-rainbow' : ''} style={{ flex: 1, fontSize: 13, fontWeight: 600, ...(item.value !== 'rainbow' ? { color: item.value } : {}) }}>{item.name}</span>
                      <span style={{ fontSize: 11, color: RARITY_COLOR[item.rarity], fontWeight: 700 }}>{item.rarity}</span>
                      <button
                        onClick={() => void handleEquip('name-color', isEquipped ? null : item.id)}
                        disabled={!!equipping}
                        style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${isEquipped ? 'var(--border)' : 'var(--primary)'}`, background: isEquipped ? 'var(--surface-2)' : 'transparent', color: isEquipped ? 'var(--text-muted)' : 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {isEquipped ? 'Unequip' : 'Equip'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {(inv?.ownedPfpEffects ?? []).length > 0 && (
            <div className="ns-card" style={{ padding: 18, marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>🖼️ Profile Picture Effects</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {inv!.ownedPfpEffects.map(item => {
                  const isEquipped = inv!.pfpEffect === item.value
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={pfpClass(item.value)} style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#00C896,#00A3CC)', flexShrink: 0, ...pfpStyle(item.value) }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.name}</span>
                      <span style={{ fontSize: 11, color: RARITY_COLOR[item.rarity], fontWeight: 700 }}>{item.rarity}</span>
                      <button
                        onClick={() => void handleEquip('pfp', isEquipped ? null : item.id)}
                        disabled={!!equipping}
                        style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${isEquipped ? 'var(--border)' : 'var(--primary)'}`, background: isEquipped ? 'var(--surface-2)' : 'transparent', color: isEquipped ? 'var(--text-muted)' : 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {isEquipped ? 'Unequip' : 'Equip'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* DEV Panel */}
      {isDevUser && (
        <div className="ns-card" style={{ padding: 20, border: '1px solid rgba(255,107,107,0.4)', background: 'rgba(255,107,107,0.04)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6b6b', marginBottom: 16 }}>🔧 DEV Panel — Grant to Self</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={devCoins} onChange={e => setDevCoins(e.target.value)}
                placeholder="500"
                style={{ width: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}
              />
              <button onClick={() => void handleDevGrant('coins')} disabled={devGranting}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#EAB308', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Grant Coins
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <select value={devType} onChange={e => setDevType(e.target.value as 'name-color' | 'pfp')}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}>
                <option value="name-color">Name Color</option>
                <option value="pfp">PFP Effect</option>
              </select>
              <input value={devItemId} onChange={e => setDevItemId(e.target.value)}
                placeholder="item-id  (e.g. rainbow)"
                style={{ flex: 1, minWidth: 140, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}
              />
              <button onClick={() => void handleDevGrant(devType)} disabled={devGranting}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ff6b6b', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Grant Item
              </button>
            </div>
            {devMsg && <div style={{ fontSize: 12, color: devMsg.startsWith('✓') ? '#22C55E' : '#EF4444', fontWeight: 600 }}>{devMsg}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
