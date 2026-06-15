import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'

const router = Router()

const addSchema = z.object({
  name: z.string().min(1).max(200),
})

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!
  const items = await prisma.collegeListItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ data: items })
})

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!
  const parse = addSchema.safeParse(req.body)
  if (!parse.success) {
    res.status(400).json({ data: null, error: { message: parse.error.errors[0]?.message ?? 'Invalid request' } })
    return
  }
  try {
    const item = await prisma.collegeListItem.create({
      data: { userId, name: parse.data.name },
    })
    res.json({ data: item })
  } catch {
    res.status(409).json({ data: null, error: { message: 'College already in your list' } })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ data: null, error: { message: 'Invalid id' } })
    return
  }
  await prisma.collegeListItem.deleteMany({ where: { id, userId } })
  res.json({ data: { deleted: true } })
})

export default router
