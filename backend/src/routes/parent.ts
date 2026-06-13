import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

router.use(requireAuth)

// ── Link a student by email ────────────────────────────────────────────────────

router.post('/link-student', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parentId = req.userId!
    const parent = await prisma.user.findUnique({ where: { id: parentId } })
    if (!parent || parent.role !== 'PARENT') {
      res.status(403).json({ error: { message: 'Only parent accounts can link students' } })
      return
    }

    const { studentEmail } = req.body as { studentEmail?: string }
    if (!studentEmail?.trim()) {
      res.status(400).json({ error: { message: 'Student email is required' } })
      return
    }

    const student = await prisma.user.findUnique({ where: { email: studentEmail.trim().toLowerCase() } })
    if (!student || student.role === 'PARENT') {
      res.status(404).json({ error: { message: 'No student account found with that email' } })
      return
    }

    const existing = await prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId: student.id } },
    })
    if (existing) {
      res.status(409).json({ error: { message: 'This student is already linked to your account' } })
      return
    }

    await prisma.parentStudentLink.create({ data: { parentId, studentId: student.id } })
    res.json({ data: { linked: true, student: { id: student.id, name: student.name, email: student.email } } })
  } catch (e) {
    console.error('[PARENT] link-student error:', e)
    res.status(500).json({ error: { message: 'Failed to link student' } })
  }
})

// ── List all linked students (summary cards) ───────────────────────────────────

router.get('/students', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parentId = req.userId!
    const links = await prisma.parentStudentLink.findMany({
      where: { parentId },
      include: {
        student: {
          include: {
            profile: true,
            courses: { include: { grades: { where: { gradingPeriod: 'CURRENT' }, take: 1 } } },
            assignments: { where: { completed: false } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const students = links.map(({ student: s }) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      gradeLevel: s.profile?.gradeLevel ?? null,
      graduationYear: s.profile?.graduationYear ?? null,
      weightedGpa: s.profile?.weightedGpa ?? 0,
      unweightedGpa: s.profile?.unweightedGpa ?? 0,
      pendingAssignments: s.assignments.length,
      totalCourses: s.courses.length,
      courses: s.courses.map(c => {
        const g = c.grades[0] ?? null
        return { name: c.name, letterGrade: g?.letterGrade ?? null, percentage: g?.percentage ?? null }
      }),
    }))

    res.json({ data: students })
  } catch (e) {
    console.error('[PARENT] get students error:', e)
    res.status(500).json({ error: { message: 'Failed to fetch students' } })
  }
})

// ── Full data for one linked student ──────────────────────────────────────────

router.get('/students/:studentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parentId = req.userId!
    const studentId = parseInt(req.params.studentId)

    const link = await prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    })
    if (!link) {
      res.status(403).json({ error: { message: 'Student not linked to your account' } })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        profile: true,
        courses: {
          include: { grades: { where: { gradingPeriod: 'CURRENT' }, take: 1 } },
          orderBy: { period: 'asc' },
        },
        assignments: { orderBy: { dueDate: 'asc' } },
      },
    })
    if (!user) {
      res.status(404).json({ error: { message: 'Student not found' } })
      return
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86400000)
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000)

    res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profile: user.profile,
        courses: user.courses.map(c => {
          const g = c.grades[0] ?? null
          return { id: c.id, name: c.name, teacher: c.teacher, period: c.period, courseType: c.courseType, creditHours: c.creditHours, semester: c.semester, grade: g ? { letterGrade: g.letterGrade, percentage: g.percentage } : null }
        }),
        assignments: user.assignments,
        stats: {
          totalCourses: user.courses.length,
          completedAssignments: user.assignments.filter(a => a.completed).length,
          pendingAssignments: user.assignments.filter(a => !a.completed).length,
          assignmentsDueToday: user.assignments.filter(a => !a.completed && a.dueDate >= todayStart && a.dueDate < todayEnd).length,
          assignmentsDueThisWeek: user.assignments.filter(a => !a.completed && a.dueDate >= todayStart && a.dueDate < weekEnd).length,
        },
      },
    })
  } catch (e) {
    console.error('[PARENT] get student detail error:', e)
    res.status(500).json({ error: { message: 'Failed to fetch student data' } })
  }
})

// ── Unlink a student ───────────────────────────────────────────────────────────

router.delete('/students/:studentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parentId = req.userId!
    const studentId = parseInt(req.params.studentId)
    await prisma.parentStudentLink.deleteMany({ where: { parentId, studentId } })
    res.json({ data: { unlinked: true } })
  } catch (e) {
    console.error('[PARENT] unlink student error:', e)
    res.status(500).json({ error: { message: 'Failed to unlink student' } })
  }
})

// ── AI chat in context of a linked student ─────────────────────────────────────

router.post('/students/:studentId/chat', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parentId = req.userId!
    const studentId = parseInt(req.params.studentId)
    const { message } = req.body as { message?: string }

    if (!message?.trim()) {
      res.status(400).json({ error: { message: 'message is required' } })
      return
    }

    const link = await prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    })
    if (!link) {
      res.status(403).json({ error: { message: 'Student not linked to your account' } })
      return
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        profile: true,
        courses: { include: { grades: { where: { gradingPeriod: 'CURRENT' }, take: 1 } } },
        assignments: { where: { completed: false }, orderBy: { dueDate: 'asc' }, take: 10 },
      },
    })
    if (!student) {
      res.status(404).json({ error: { message: 'Student not found' } })
      return
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const coursesSummary = student.courses
      .map(c => {
        const g = c.grades[0]
        return `${c.name}: ${g ? `${g.letterGrade} (${g.percentage.toFixed(1)}%)` : 'no grade'}`
      })
      .join(', ')

    const systemPrompt = `You are NextStep AI, an academic advisor assistant for parents.
You are helping a parent review their student's academic performance.
Student: ${student.name ?? 'Unknown'}
Grade level: ${student.profile?.gradeLevel ?? 'unknown'}
Weighted GPA: ${student.profile?.weightedGpa?.toFixed(2) ?? 'unknown'}
Unweighted GPA: ${student.profile?.unweightedGpa?.toFixed(2) ?? 'unknown'}
Current courses: ${coursesSummary || 'none on file'}
Pending assignments: ${student.assignments.length}
Answer the parent's question clearly and helpfully. Be concise.`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: message.trim() }],
    })

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : 'No response.'
    res.json({ data: { reply } })
  } catch (e) {
    console.error('[PARENT] chat error:', e)
    res.status(500).json({ error: { message: 'AI chat failed' } })
  }
})

export default router
