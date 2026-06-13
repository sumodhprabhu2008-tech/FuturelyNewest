import { Router, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

router.post('/chat', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }
  try {
    const { message: userMessage } = req.body as { message: string }

    const profile = await prisma.profile.findUnique({ where: { userId: req.userId } })
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    const courses = await prisma.course.findMany({
      where: { userId: req.userId },
      include: { grades: { where: { gradingPeriod: 'CURRENT' }, take: 1 } },
    })
    const assignments = await prisma.assignment.findMany({
      where: { userId: req.userId, completed: false },
      orderBy: { dueDate: 'asc' },
      take: 3,
    })

    const firstName = user?.name?.split(' ')[0] ?? 'Student'
    const wGpa = profile?.weightedGpa?.toFixed(2) ?? 'unknown'
    const uGpa = profile?.unweightedGpa?.toFixed(2) ?? 'unknown'

    const sorted = [...courses].sort((a, b) => {
      const ga = a.grades[0]?.percentage ?? 100
      const gb = b.grades[0]?.percentage ?? 100
      return ga - gb
    })

    const courseList = sorted
      .map(c => `${c.name}: ${c.grades[0]?.percentage ?? 'N/A'}%`)
      .join(', ')

    const assignmentList = assignments
      .map(a => `"${a.title}" (${a.subject}) due ${new Date(a.dueDate).toLocaleDateString()}`)
      .join(', ')

    const systemPrompt = `You are NextStep AI, an academic companion for high school students.
Student: ${firstName}, Grade ${profile?.gradeLevel ?? 'unknown'}
GPA: ${uGpa} unweighted, ${wGpa} weighted
Courses: ${courseList || 'none on record'}
Pending assignments: ${assignmentList || 'none'}
SAT score: ${profile?.satScore ?? 'not entered'}
College goal: ${profile?.futureDecision ?? 'not specified'}

Be encouraging, concise, and specific. Only reference the student data above — never invent numbers or facts. Keep responses under 3 sentences.`

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const reply =
      aiResponse.content[0]?.type === 'text'
        ? aiResponse.content[0].text
        : 'Sorry, I could not generate a response right now.'

    res.json({ data: { reply } })
  } catch {
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.get('/study-plan', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }
  try {
    const assignments = await prisma.assignment.findMany({
      where: { userId: req.userId, completed: false },
      orderBy: { dueDate: 'asc' },
      take: 20,
    })

    if (assignments.length === 0) {
      res.json({ data: { overview: "You're all caught up! No assignments pending.", days: [] } })
      return
    }

    const today = new Date()
    const todayStr = today.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    const assignmentList = assignments.map(a => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      dueDate: new Date(a.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      estimatedMinutes: a.estimatedMinutes,
    }))

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      tools: [
        {
          name: 'create_study_plan',
          description: 'Create a structured daily study plan for the student',
          input_schema: {
            type: 'object' as const,
            properties: {
              overview: {
                type: 'string',
                description: 'A brief motivational overview of the study plan (1-2 sentences)',
              },
              days: {
                type: 'array',
                description: 'Daily study sessions — only include days that have work',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: '"Today", "Tomorrow", or e.g. "Wednesday, Jun 11"' },
                    date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
                    sessions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          assignmentId: { type: 'number' },
                          title: { type: 'string' },
                          subject: { type: 'string' },
                          dueDate: { type: 'string' },
                          minutesToSpend: { type: 'number', description: 'Minutes to work on this today (may be partial)' },
                          notes: { type: 'string', description: 'What to focus on, or why this is scheduled today' },
                        },
                        required: ['assignmentId', 'title', 'subject', 'dueDate', 'minutesToSpend', 'notes'],
                      },
                    },
                  },
                  required: ['label', 'date', 'sessions'],
                },
              },
            },
            required: ['overview', 'days'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'create_study_plan' },
      messages: [
        {
          role: 'user',
          content: `Today is ${todayStr}. Create a realistic study plan for these assignments:\n\n${JSON.stringify(assignmentList, null, 2)}\n\nRules: max 120 min/day, prioritize soonest due dates, split large tasks across days, only include days with work.`,
        },
      ],
    })

    const toolUse = aiResponse.content.find(c => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(500).json({ data: null, error: { code: 'AI_ERROR', message: 'Failed to generate plan' } })
      return
    }

    res.json({ data: toolUse.input })
  } catch (err) {
    console.error('[AI STUDY PLAN]', err)
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

export default router
