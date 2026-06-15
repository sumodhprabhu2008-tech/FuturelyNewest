import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logger } from '../common/logger'

const router = Router()

const listQuerySchema = z.object({
  status: z.enum(['incomplete', 'complete', 'all']).default('all'),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const patchBodySchema = z.object({
  completed: z.boolean(),
})

const patchParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } })
    return
  }

  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(422).json({
      data: null,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
    })
    return
  }

  const { status, cursor, limit } = parsed.data

  try {
    const where = {
      userId: req.userId,
      ...(status === 'incomplete' && { completed: false }),
      ...(status === 'complete' && { completed: true }),
    }

    const assignments = await prisma.assignment.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      take: limit + 1,
      ...(cursor !== undefined && {
        cursor: { id: cursor },
        skip: 1,
      }),
    })

    const hasNextPage = assignments.length > limit
    const page = hasNextPage ? assignments.slice(0, limit) : assignments
    const nextCursor = hasNextPage ? page[page.length - 1].id : null

    res.status(200).json({
      data: page,
      meta: { nextCursor, hasNextPage, count: page.length },
    })
  } catch (err) {
    logger.error('Failed to fetch assignments', { err })
    res.status(500).json({
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch assignments' },
    })
  }
})

router.patch('/:id/complete', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } })
    return
  }

  const params = patchParamsSchema.safeParse(req.params)
  const body = patchBodySchema.safeParse(req.body)

  if (!params.success || !body.success) {
    res.status(422).json({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        details: {
          ...(!params.success && { params: params.error.flatten() }),
          ...(!body.success && { body: body.error.flatten() }),
        },
      },
    })
    return
  }

  const { id } = params.data
  const { completed } = body.data

  try {
    const result = await prisma.assignment.updateMany({
      where: { id, userId: req.userId },
      data: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    })

    if (result.count === 0) {
      res.status(404).json({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Assignment not found' },
      })
      return
    }

    const updated = await prisma.assignment.findFirst({ where: { id, userId: req.userId } })

    res.status(200).json({ data: updated })
  } catch (err) {
    logger.error('Failed to update assignment completion', { err })
    res.status(500).json({
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update assignment' },
    })
  }
})

export default router
