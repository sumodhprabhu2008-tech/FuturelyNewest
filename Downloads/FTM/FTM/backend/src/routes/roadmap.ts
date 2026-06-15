import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

function categorize(name: string): string {
  const n = name.toLowerCase()
  if (/english|literature|writing|composition|oral interp|reading/.test(n)) return 'English'
  if (/math|calculus|geometry|algebra|statistics|precalculus|reasoning/.test(n)) return 'Math'
  if (/biology|chemistry|physics|science|integrated physics/.test(n)) return 'Science'
  if (/history|government|economics|geography|social/.test(n)) return 'Social Studies'
  if (/spanish|french|chinese|latin|german|japanese/.test(n)) return 'Language'
  if (/art|music|theater|floral|design|photography|fine/.test(n)) return 'Fine Arts'
  if (/pe |physical|health|athletics|tennis|swimming|gym/.test(n)) return 'PE / Health'
  return 'Electives'
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }
  try {
    const profile = await prisma.profile.findUnique({ where: { userId: req.userId } })
    const courses = await prisma.course.findMany({
      where: { userId: req.userId },
      include: { grades: { where: { gradingPeriod: 'CURRENT' }, take: 1 } },
    })

    const creditsByCategory: Record<string, number> = {
      English: 0, Math: 0, Science: 0, 'Social Studies': 0,
      Language: 0, 'Fine Arts': 0, 'PE / Health': 0, Electives: 0,
    }

    let creditsCompleted = 0
    for (const c of courses) {
      const grade = c.grades[0]
      const passed = grade && grade.letterGrade !== 'F'
      if (passed) {
        creditsCompleted += c.creditHours
        const cat = categorize(c.name)
        creditsByCategory[cat] = (creditsByCategory[cat] ?? 0) + c.creditHours
      }
    }

    const gradeLevel = profile?.gradeLevel ?? 9
    const creditsRequired = 26

    const milestones = [
      { grade: 9,  label: 'Explore interests, build strong foundations', done: gradeLevel > 9 },
      { grade: 10, label: 'Challenge yourself — consider AP or Honors courses', done: gradeLevel > 10 },
      { grade: 11, label: 'SAT/ACT prep, start college research', done: gradeLevel > 11 },
      { grade: 12, label: 'Apply to colleges, finalize your plans', done: false },
    ]

    res.json({
      data: {
        gradeLevel,
        graduationYear: profile?.graduationYear ?? null,
        creditsCompleted,
        creditsRequired,
        percentComplete: Math.round((creditsCompleted / creditsRequired) * 100),
        creditsByCategory,
        milestones,
        weightedGpa: profile?.weightedGpa ?? 0,
        unweightedGpa: profile?.unweightedGpa ?? 0,
        futureDecision: profile?.futureDecision ?? null,
      },
    })
  } catch {
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

export default router
