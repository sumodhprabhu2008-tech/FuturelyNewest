import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        profile: true,
        courses: {
          include: {
            grades: { where: { gradingPeriod: 'CURRENT' }, take: 1 },
          },
          orderBy: { period: 'asc' },
        },
        assignments: {
          orderBy: { dueDate: 'asc' },
        },
      },
    })

    if (!user) {
      res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'User not found' } })
      return
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86400000)
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000)

    const stats = {
      totalCourses: user.courses.length,
      completedAssignments: user.assignments.filter(a => a.completed).length,
      pendingAssignments: user.assignments.filter(a => !a.completed).length,
      assignmentsDueToday: user.assignments.filter(
        a => !a.completed && a.dueDate >= todayStart && a.dueDate < todayEnd
      ).length,
      assignmentsDueThisWeek: user.assignments.filter(
        a => !a.completed && a.dueDate >= todayStart && a.dueDate < weekEnd
      ).length,
    }

    const courses = user.courses.map(c => {
      const g = c.grades[0] ?? null
      return {
        id: c.id,
        name: c.name,
        teacher: c.teacher,
        period: c.period,
        courseType: c.courseType,
        creditHours: c.creditHours,
        semester: c.semester,
        grade: g ? { letterGrade: g.letterGrade, percentage: g.percentage } : null,
      }
    })

    res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profile: user.profile,
        courses,
        assignments: user.assignments,
        stats,
      },
    })
  } catch {
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.patch('/me/profile', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.userId) { res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }); return }
  const { satScore, actScore, futureDecision } = req.body as {
    satScore?: number | null
    actScore?: number | null
    futureDecision?: string | null
  }
  try {
    const profile = await prisma.profile.upsert({
      where: { userId: req.userId },
      create: {
        userId: req.userId,
        ...(satScore !== undefined && { satScore: satScore ?? null }),
        ...(actScore !== undefined && { actScore: actScore ?? null }),
        ...(futureDecision !== undefined && { futureDecision: futureDecision ?? null }),
      },
      update: {
        ...(satScore !== undefined && { satScore: satScore ?? null }),
        ...(actScore !== undefined && { actScore: actScore ?? null }),
        ...(futureDecision !== undefined && { futureDecision: futureDecision ?? null }),
      },
    })
    res.json({ data: profile })
  } catch {
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' } })
  }
})

export default router
