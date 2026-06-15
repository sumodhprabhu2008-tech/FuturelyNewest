import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

// ── Loot Tables ───────────────────────────────────────────────────────────────

interface TagItem  { id: string; tag: string; tagColor: string; rarity: string; weight: number }
interface ColorItem { id: string; name: string; value: string; rarity: string; weight: number }

const TAG_BOX_ITEMS: TagItem[] = [
  { id: 'grinder',        tag: 'Grinder',        tagColor: '#6B7280', rarity: 'Common',    weight: 20   },
  { id: 'focused',        tag: 'Focused',         tagColor: '#6B7280', rarity: 'Common',    weight: 20   },
  { id: 'scholar',        tag: 'Scholar',         tagColor: '#6B7280', rarity: 'Common',    weight: 20   },
  { id: 'honors-student', tag: 'Honors Student',  tagColor: '#3B82F6', rarity: 'Uncommon',  weight: 12.5 },
  { id: 'ap-student',     tag: 'AP Student',      tagColor: '#06B6D4', rarity: 'Uncommon',  weight: 12.5 },
  { id: 'deans-list',     tag: "Dean's List",     tagColor: '#8B5CF6', rarity: 'Rare',      weight: 5    },
  { id: 'top-performer',  tag: 'Top Performer',   tagColor: '#8B5CF6', rarity: 'Rare',      weight: 5    },
  { id: 'ace',            tag: 'Ace',             tagColor: '#F97316', rarity: 'Epic',      weight: 1.75 },
  { id: 'prodigy',        tag: 'Prodigy',         tagColor: '#EC4899', rarity: 'Epic',      weight: 1.75 },
  { id: 'mastermind',     tag: 'Mastermind',      tagColor: '#EAB308', rarity: 'Legendary', weight: 0.5  },
  { id: 'genius',         tag: 'Genius',          tagColor: '#EC4899', rarity: 'Legendary', weight: 0.5  },
  { id: 'goat',           tag: 'GOAT',            tagColor: '#EAB308', rarity: 'Mythic',    weight: 0.5  },
]

const NAME_COLOR_BOX_ITEMS: ColorItem[] = [
  { id: 'forest-green',  name: 'Forest Green',  value: '#15803D', rarity: 'Common',    weight: 12    },
  { id: 'navy-blue',     name: 'Navy Blue',      value: '#1D4ED8', rarity: 'Common',    weight: 12    },
  { id: 'dark-red',      name: 'Dark Red',       value: '#991B1B', rarity: 'Common',    weight: 12    },
  { id: 'slate-blue',    name: 'Slate Blue',     value: '#4338CA', rarity: 'Common',    weight: 12    },
  { id: 'teal',          name: 'Teal',           value: '#0F766E', rarity: 'Common',    weight: 12    },
  { id: 'bright-orange', name: 'Bright Orange',  value: '#EA580C', rarity: 'Uncommon',  weight: 8.33  },
  { id: 'violet',        name: 'Violet',         value: '#7C3AED', rarity: 'Uncommon',  weight: 8.33  },
  { id: 'cyan',          name: 'Cyan',           value: '#0891B2', rarity: 'Uncommon',  weight: 8.33  },
  { id: 'hot-pink',      name: 'Hot Pink',       value: '#DB2777', rarity: 'Rare',      weight: 3.34  },
  { id: 'gold',          name: 'Gold',           value: '#D97706', rarity: 'Rare',      weight: 3.33  },
  { id: 'lime-green',    name: 'Lime Green',     value: '#65A30D', rarity: 'Rare',      weight: 3.33  },
  { id: 'electric-blue', name: 'Electric Blue',  value: '#2563EB', rarity: 'Epic',      weight: 2     },
  { id: 'magenta',       name: 'Magenta',        value: '#C026D3', rarity: 'Epic',      weight: 2     },
  { id: 'pure-white',    name: 'Pure White',     value: '#F8FAFC', rarity: 'Legendary', weight: 0.5   },
  { id: 'black',         name: 'Black',          value: '#111111', rarity: 'Legendary', weight: 0.5   },
  { id: 'rainbow',       name: 'Rainbow RGB',    value: 'rainbow', rarity: 'Mythic',    weight: 0.01  },
]

const PFP_EFFECT_BOX_ITEMS: ColorItem[] = [
  { id: 'border-green',    name: 'Green Border',     value: 'border-green',   rarity: 'Common',    weight: 12   },
  { id: 'border-blue',     name: 'Blue Border',      value: 'border-blue',    rarity: 'Common',    weight: 12   },
  { id: 'border-red',      name: 'Red Border',       value: 'border-red',     rarity: 'Common',    weight: 12   },
  { id: 'border-navy',     name: 'Navy Border',      value: 'border-navy',    rarity: 'Common',    weight: 12   },
  { id: 'border-teal',     name: 'Teal Border',      value: 'border-teal',    rarity: 'Common',    weight: 12   },
  { id: 'border-orange',   name: 'Orange Border',    value: 'border-orange',  rarity: 'Uncommon',  weight: 8.33 },
  { id: 'border-violet',   name: 'Violet Border',    value: 'border-violet',  rarity: 'Uncommon',  weight: 8.33 },
  { id: 'border-cyan',     name: 'Cyan Border',      value: 'border-cyan',    rarity: 'Uncommon',  weight: 8.33 },
  { id: 'border-hotpink',  name: 'Hot Pink Border',  value: 'border-hotpink', rarity: 'Rare',      weight: 3.34 },
  { id: 'border-gold',     name: 'Gold Border',      value: 'border-gold',    rarity: 'Rare',      weight: 3.33 },
  { id: 'border-lime',     name: 'Lime Border',      value: 'border-lime',    rarity: 'Rare',      weight: 3.33 },
  { id: 'glow-pink',       name: 'Pink Glow',        value: 'glow-pink',      rarity: 'Epic',      weight: 2    },
  { id: 'glow-purple',     name: 'Purple Glow',      value: 'glow-purple',    rarity: 'Epic',      weight: 2    },
  { id: 'glow-gold',       name: 'Gold Fill',        value: 'glow-gold',      rarity: 'Legendary', weight: 0.5  },
  { id: 'frame-black',     name: 'Void Fill',        value: 'frame-black',    rarity: 'Legendary', weight: 0.5  },
  { id: 'rainbow',         name: 'Rainbow Animated', value: 'rainbow',        rarity: 'Mythic',    weight: 0.01 },
]

export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

function parseJsonArr(raw: unknown): Array<{ id: string; [k: string]: unknown }> {
  if (Array.isArray(raw)) return raw as Array<{ id: string; [k: string]: unknown }>
  try { return JSON.parse(String(raw ?? '[]')) } catch { return [] }
}

function parseTagArr(raw: unknown): Array<{ tag: string; tagColor: string }> {
  if (Array.isArray(raw)) return raw as Array<{ tag: string; tagColor: string }>
  try { return JSON.parse(String(raw ?? '[]')) } catch { return [] }
}

// ── Daily Coins ───────────────────────────────────────────────────────────────

router.post('/daily-coins', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const { streak } = req.body as { streak?: number }
    const streakDay = typeof streak === 'number' && streak >= 1 ? streak : 1
    const coinBonus = 30 + (streakDay - 1) * 5

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { coins: true, lastCoinClaim: true } })
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    const todayUTC = new Date().toISOString().slice(0, 10)
    const lastClaimDate = user.lastCoinClaim ? user.lastCoinClaim.toISOString().slice(0, 10) : null

    if (lastClaimDate === todayUTC) {
      res.json({ data: { coins: user.coins, claimed: false, alreadyClaimed: true, coinBonus } })
      return
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { coins: { increment: coinBonus }, lastCoinClaim: new Date() },
      select: { coins: true },
    })
    res.json({ data: { coins: updated.coins, claimed: true, alreadyClaimed: false, coinBonus } })
  } catch {
    res.status(500).json({ error: 'Failed to claim daily coins' })
  }
})

// ── Inventory ─────────────────────────────────────────────────────────────────

router.get('/inventory', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { coins: true, nameColor: true, pfpEffect: true, ownedNameColors: true, ownedPfpEffects: true, lastCoinClaim: true },
    })
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    const todayUTC = new Date().toISOString().slice(0, 10)
    const canClaimToday = !user.lastCoinClaim || user.lastCoinClaim.toISOString().slice(0, 10) !== todayUTC

    res.json({
      data: {
        coins: user.coins,
        canClaimToday,
        nameColor: user.nameColor,
        pfpEffect: user.pfpEffect,
        ownedNameColors: parseJsonArr(user.ownedNameColors),
        ownedPfpEffects: parseJsonArr(user.ownedPfpEffects),
      },
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch inventory' })
  }
})

// ── Open Box ──────────────────────────────────────────────────────────────────

router.post('/open-box', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { boxType } = req.body as { boxType?: string }
  if (!boxType || !['tag', 'name-color', 'pfp'].includes(boxType)) {
    res.status(400).json({ error: 'boxType must be tag, name-color, or pfp' }); return
  }

  const BOX_COST = 10
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { coins: true, allTags: true, ownedNameColors: true, ownedPfpEffects: true },
    })
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    if (user.coins < BOX_COST) {
      res.status(402).json({ error: 'Not enough coins', coins: user.coins }); return
    }

    if (boxType === 'tag') {
      const won = weightedRandom(TAG_BOX_ITEMS)
      const existingTags = parseTagArr(user.allTags)
      const alreadyHas = existingTags.some(t => t.tag === won.tag)
      const newAllTags = alreadyHas ? existingTags : [...existingTags, { tag: won.tag, tagColor: won.tagColor }]

      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { decrement: BOX_COST }, allTags: JSON.stringify(newAllTags) },
        select: { coins: true },
      })
      res.json({ data: { coins: updated.coins, won: { ...won, type: 'tag' }, alreadyHad: alreadyHas } })

    } else if (boxType === 'name-color') {
      const won = weightedRandom(NAME_COLOR_BOX_ITEMS)
      const owned = parseJsonArr(user.ownedNameColors)
      const alreadyHas = owned.some(i => i.id === won.id)
      const newOwned = alreadyHas ? owned : [...owned, { id: won.id, name: won.name, value: won.value, rarity: won.rarity }]

      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { decrement: BOX_COST }, ownedNameColors: JSON.stringify(newOwned) },
        select: { coins: true },
      })
      res.json({ data: { coins: updated.coins, won: { ...won, type: 'name-color' }, alreadyHad: alreadyHas } })

    } else {
      const won = weightedRandom(PFP_EFFECT_BOX_ITEMS)
      const owned = parseJsonArr(user.ownedPfpEffects)
      const alreadyHas = owned.some(i => i.id === won.id)
      const newOwned = alreadyHas ? owned : [...owned, { id: won.id, name: won.name, value: won.value, rarity: won.rarity }]

      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { decrement: BOX_COST }, ownedPfpEffects: JSON.stringify(newOwned) },
        select: { coins: true },
      })
      res.json({ data: { coins: updated.coins, won: { ...won, type: 'pfp' }, alreadyHad: alreadyHas } })
    }
  } catch {
    res.status(500).json({ error: 'Failed to open box' })
  }
})

// ── Equip ─────────────────────────────────────────────────────────────────────

router.put('/equip', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { type, itemId } = req.body as { type?: string; itemId?: string | null }
  if (!type || !['name-color', 'pfp'].includes(type)) {
    res.status(400).json({ error: 'type must be name-color or pfp' }); return
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { ownedNameColors: true, ownedPfpEffects: true },
    })
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    if (type === 'name-color') {
      if (itemId !== null && itemId !== undefined) {
        const owned = parseJsonArr(user.ownedNameColors)
        const item = owned.find(i => i.id === itemId)
        if (!item) { res.status(403).json({ error: 'You do not own this item' }); return }
      }
      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { nameColor: itemId ? (parseJsonArr(user.ownedNameColors).find(i => i.id === itemId) as { value?: string } | undefined)?.value ?? null : null },
        select: { nameColor: true },
      })
      res.json({ data: { nameColor: updated.nameColor } })
    } else {
      if (itemId !== null && itemId !== undefined) {
        const owned = parseJsonArr(user.ownedPfpEffects)
        const item = owned.find(i => i.id === itemId)
        if (!item) { res.status(403).json({ error: 'You do not own this item' }); return }
      }
      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { pfpEffect: itemId ? (parseJsonArr(user.ownedPfpEffects).find(i => i.id === itemId) as { value?: string } | undefined)?.value ?? null : null },
        select: { pfpEffect: true },
      })
      res.json({ data: { pfpEffect: updated.pfpEffect } })
    }
  } catch {
    res.status(500).json({ error: 'Failed to equip item' })
  }
})

// ── DEV Admin Grant (self only) ───────────────────────────────────────────────

router.post('/admin/grant', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true, tag: true } })
    if (me?.role !== 'DEV' && me?.role !== 'ADMIN' && me?.tag !== 'DEV') {
      res.status(403).json({ error: 'DEV access required' }); return
    }

    const { type, amount, itemId, itemType } = req.body as {
      type: 'coins' | 'name-color' | 'pfp' | 'tag'
      amount?: number
      itemId?: string
      itemType?: string
      tag?: string
      tagColor?: string
    }

    if (type === 'coins') {
      if (typeof amount !== 'number' || amount < 0) { res.status(400).json({ error: 'amount must be a non-negative number' }); return }
      const updated = await prisma.user.update({ where: { id: req.userId }, data: { coins: { increment: amount } }, select: { coins: true } })
      res.json({ data: { coins: updated.coins } })

    } else if (type === 'name-color') {
      const pool = NAME_COLOR_BOX_ITEMS
      const item = itemId ? pool.find(i => i.id === itemId) : null
      if (!item) { res.status(400).json({ error: 'Unknown name-color itemId' }); return }
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { ownedNameColors: true } })
      const owned = parseJsonArr(user?.ownedNameColors)
      if (!owned.some(i => i.id === item.id)) {
        owned.push({ id: item.id, name: item.name, value: item.value, rarity: item.rarity })
        await prisma.user.update({ where: { id: req.userId }, data: { ownedNameColors: JSON.stringify(owned) } })
      }
      res.json({ data: { granted: item } })

    } else if (type === 'pfp') {
      const pool = PFP_EFFECT_BOX_ITEMS
      const item = itemId ? pool.find(i => i.id === itemId) : null
      if (!item) { res.status(400).json({ error: 'Unknown pfp itemId' }); return }
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { ownedPfpEffects: true } })
      const owned = parseJsonArr(user?.ownedPfpEffects)
      if (!owned.some(i => i.id === item.id)) {
        owned.push({ id: item.id, name: item.name, value: item.value, rarity: item.rarity })
        await prisma.user.update({ where: { id: req.userId }, data: { ownedPfpEffects: JSON.stringify(owned) } })
      }
      res.json({ data: { granted: item } })

    } else {
      res.status(400).json({ error: 'Unknown grant type' })
    }
  } catch {
    res.status(500).json({ error: 'Failed to process grant' })
  }
})

// ── Catalog (for frontend to read loot tables) ────────────────────────────────

router.get('/catalog', (_req, res: Response) => {
  res.json({
    data: {
      tagBox: TAG_BOX_ITEMS,
      nameColorBox: NAME_COLOR_BOX_ITEMS,
      pfpBox: PFP_EFFECT_BOX_ITEMS,
      boxCost: 10,
    },
  })
})

export default router
