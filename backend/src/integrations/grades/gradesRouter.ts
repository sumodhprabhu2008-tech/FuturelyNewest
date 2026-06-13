import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../../middleware/auth'
import {
  loginHAC,
  getGrades as hacGrades,
  getTranscript as hacTranscript,
  getSchedule,
  getStudentInfo,
} from './hacClient'
import {
  loginPowerSchool,
  getGrades as psGrades,
  getTranscript as psTranscript,
} from './powerSchoolClient'
import { buildSessionWithCLCookie } from './classLinkHelper'
import { getSessionByUserId, getSessionByToken, deleteSessionByUserId, restoreSessionFromCache, type SchoolSystemType } from './sessionStore'
import { prisma } from '../../lib/prisma'
import { normalizeHacGrades, normalizePsGrades } from './normalizeGrades'

const router = Router()

// ── Input schemas ──────────────────────────────────────────────────────────────

const hacLoginSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  username: z.string().min(1, 'username required'),
  password: z.string().min(1, 'password required'),
  clsessionCookie: z.string().optional(),
})

const psLoginSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  username: z.string().min(1, 'username required'),
  password: z.string().min(1, 'password required'),
})

// ── GPA calculator ─────────────────────────────────────────────────────────────

const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  'D-': 0.7,
  F: 0.0,
}

function letterToGPA(letter: string): number | null {
  return GRADE_POINTS[letter.trim()] ?? null
}

function computeGPA(grades: Array<{ average: string | null; grade?: string | null }>): number | null {
  const points: number[] = []

  for (const g of grades) {
    const raw = g.average ?? g.grade ?? null
    if (!raw) continue

    const letter = raw.trim().toUpperCase()
    const p = letterToGPA(letter)

    if (p !== null) {
      points.push(p)
      continue
    }

    const num = parseFloat(raw)

    if (!Number.isNaN(num)) {
      if (num >= 90) points.push(4.0)
      else if (num >= 80) points.push(3.0)
      else if (num >= 70) points.push(2.0)
      else if (num >= 60) points.push(1.0)
      else points.push(0.0)
    }
  }

  if (!points.length) return null

  return Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 100) / 100
}

// ── Error helpers ──────────────────────────────────────────────────────────────

function getErrorDetails(err: unknown): {
  message: string
  code?: string
  status?: number
  responseData?: unknown
  stack?: string
} {
  const anyErr = err as {
    message?: string
    code?: string
    stack?: string
    response?: {
      status?: number
      data?: unknown
    }
  }

  return {
    message: anyErr?.message ?? 'Unknown error',
    code: anyErr?.code,
    status: anyErr?.response?.status,
    responseData: anyErr?.response?.data,
    stack: anyErr?.stack,
  }
}

function statusFromError(message: string, status?: number): number {
  if (status && status >= 400 && status < 600) return status
  if (message.toLowerCase().includes('invalid credentials')) return 401
  if (message.toLowerCase().includes('password')) return 401
  if (message.toLowerCase().includes('timeout')) return 504
  if (message.toLowerCase().includes('reach')) return 502
  if (message.toLowerCase().includes('network')) return 502
  return 500
}

function sendError(res: Response, label: string, err: unknown, fallbackCode: string): void {
  const details = getErrorDetails(err)
  const status = statusFromError(details.message, details.status)

  console.error(`[${label}] FAILED`, {
    message: details.message,
    code: details.code,
    status: details.status,
    responseData: details.responseData,
    stack: details.stack,
  })

  res.status(status).json({
    data: null,
    error: {
      code: fallbackCode,
      message: details.message,
      details: {
        code: details.code,
        status: details.status,
        responseData: details.responseData,
      },
    },
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function requireSession(userId: number, res: Response): ReturnType<typeof getSessionByUserId> {
  const entry = getSessionByUserId(userId)

  if (!entry) {
    res.status(401).json({
      data: null,
      error: {
        code: 'NO_SCHOOL_SESSION',
        message: 'No active school session. Please log in to your school portal first.',
      },
    })

    return null
  }

  return entry
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.post('/hac/login', async (req: AuthRequest, res: Response): Promise<void> => {
  console.log('[GRADES ROUTER] HAC login route hit')

  const parse = hacLoginSchema.safeParse(req.body)

  if (!parse.success) {
    console.log('[GRADES ROUTER] HAC validation failed:', parse.error.errors)

    res.status(400).json({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: parse.error.errors[0]?.message ?? 'Invalid request',
      },
    })

    return
  }

  const { baseUrl, username, password, clsessionCookie } = parse.data
  const userId = req.userId!

  console.log('[GRADES ROUTER] HAC login parsed:', {
    userId,
    baseUrl,
    usernameExists: Boolean(username),
    passwordExists: Boolean(password),
    hasClSessionCookie: Boolean(clsessionCookie),
  })

  try {
    let resolvedBaseUrl = baseUrl

    if (clsessionCookie) {
      const cl = buildSessionWithCLCookie(clsessionCookie, baseUrl)
      resolvedBaseUrl = cl.districtUrl
    }

    console.log('[GRADES ROUTER] Calling loginHAC:', {
      resolvedBaseUrl,
      userId,
    })

    const sessionToken = await loginHAC(
      resolvedBaseUrl,
      username,
      password,
      userId,
      clsessionCookie,
    )

    console.log('[GRADES ROUTER] loginHAC success:', {
      hasSessionToken: Boolean(sessionToken),
    })

    await prisma.schoolConnection.upsert({
      where: { userId },
      update: {
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
        lastSynced: new Date(),
      },
      create: {
        userId,
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
      },
    })

    // Best-effort: fetch real student name from HAC and update User record
    try {
      console.log('[GRADES ROUTER] Fetching student info from HAC...')
      const studentInfo = await getStudentInfo(sessionToken)

      if (studentInfo.name && studentInfo.name.trim().length > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            name: studentInfo.name.trim(),
          },
        })
        console.log('[GRADES ROUTER] Updated user name from HAC:', studentInfo.name.trim())
      }
    } catch (infoErr: unknown) {
      // Non-fatal: log and continue. Login still succeeds.
      console.warn('[GRADES ROUTER] Could not fetch student info (non-fatal):',
        infoErr instanceof Error ? infoErr.message : String(infoErr)
      )
    }

    // Persist the session cookie to DB so it can survive backend restarts
    try {
      const stored = getSessionByToken(sessionToken)
      if (stored) {
        await prisma.schoolConnection.update({
          where: { userId },
          data: { cachedSession: stored.sessionData },
        })
        console.log('[GRADES ROUTER] Session cached to DB for userId:', userId)
      }
    } catch (cacheErr) {
      console.warn('[GRADES ROUTER] Non-fatal: could not cache session:',
        cacheErr instanceof Error ? cacheErr.message : String(cacheErr))
    }

    res.json({
      data: {
        sessionToken,
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
        expiresIn: 1800,
      },
    })
  } catch (err: unknown) {
    sendError(res, 'HAC_LOGIN', err, 'LOGIN_FAILED')
  }
})

router.post('/powerschool/login', async (req: AuthRequest, res: Response): Promise<void> => {
  console.log('[GRADES ROUTER] PowerSchool login route hit')

  const parse = psLoginSchema.safeParse(req.body)

  if (!parse.success) {
    console.log('[GRADES ROUTER] PowerSchool validation failed:', parse.error.errors)

    res.status(400).json({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: parse.error.errors[0]?.message ?? 'Invalid request',
      },
    })

    return
  }

  const { baseUrl, username, password } = parse.data
  const userId = req.userId!

  console.log('[GRADES ROUTER] PowerSchool login parsed:', {
    userId,
    baseUrl,
    usernameExists: Boolean(username),
    passwordExists: Boolean(password),
  })

  try {
    const sessionToken = await loginPowerSchool(baseUrl, username, password, userId)

    await prisma.schoolConnection.upsert({
      where: { userId },
      update: {
        systemType: 'PowerSchool',
        districtUrl: baseUrl,
        lastSynced: new Date(),
      },
      create: {
        userId,
        systemType: 'PowerSchool',
        districtUrl: baseUrl,
      },
    })

    // Persist the session cookie to DB so it can survive backend restarts
    try {
      const stored = getSessionByToken(sessionToken)
      if (stored) {
        await prisma.schoolConnection.update({
          where: { userId },
          data: { cachedSession: stored.sessionData },
        })
        console.log('[GRADES ROUTER] PS session cached to DB for userId:', userId)
      }
    } catch (cacheErr) {
      console.warn('[GRADES ROUTER] Non-fatal: could not cache PS session:',
        cacheErr instanceof Error ? cacheErr.message : String(cacheErr))
    }

    res.json({
      data: {
        sessionToken,
        systemType: 'PowerSchool',
        districtUrl: baseUrl,
        expiresIn: 1800,
      },
    })
  } catch (err: unknown) {
    sendError(res, 'POWERSCHOOL_LOGIN', err, 'LOGIN_FAILED')
  }
})

router.get('/current', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!
  const entry = requireSession(userId, res)
  if (!entry) return

  try {
    if (entry.session.systemType === 'HAC') {
      const rawHacGrades = await hacGrades(entry.token)
      const normalizedGrades = normalizeHacGrades(rawHacGrades)

      // Sync upcoming assignments from HAC into the planner.
      // Collect all upcoming assignments across all courses.
      const upcomingToSync = normalizedGrades.flatMap(course =>
        (course.upcomingAssignments ?? []).map(a => ({
          userId,
          title: a.name,
          subject: course.name,
          dueDate: a.dateDue
            ? (() => {
                const parsed = new Date(a.dateDue)
                return isNaN(parsed.getTime()) ? new Date(Date.now() + 7 * 86400000) : parsed
              })()
            : new Date(Date.now() + 7 * 86400000), // default 1 week out if no date
          estimatedMinutes: 30,
          source: 'HAC',
        }))
      )

      // Upsert upcoming assignments — avoid duplicates by userId + title + subject
      if (upcomingToSync.length > 0) {
        for (const assignment of upcomingToSync) {
          await prisma.assignment.upsert({
            where: {
              userId_title_subject: {
                userId: assignment.userId,
                title: assignment.title,
                subject: assignment.subject,
              },
            },
            update: {
              dueDate: assignment.dueDate,
              source: 'HAC',
            },
            create: {
              ...assignment,
              completed: false,
            },
          }).catch(async () => {
            // Fallback if unique constraint doesn't exist: findFirst + create
            const existing = await prisma.assignment.findFirst({
              where: { userId: assignment.userId, title: assignment.title, subject: assignment.subject },
            })
            if (!existing) {
              await prisma.assignment.create({ data: { ...assignment, completed: false } })
            }
          })
        }
        console.log(`[GRADES ROUTER] Synced ${upcomingToSync.length} upcoming assignments from HAC`)
      }

      res.json({
        data: {
          systemType: entry.session.systemType,
          grades: normalizedGrades,
          upcomingAssignmentsSynced: upcomingToSync.length,
        },
      })
    } else {
      const rawPsGrades = await psGrades(entry.token)
      const normalizedGrades = normalizePsGrades(rawPsGrades)

      res.json({
        data: {
          systemType: entry.session.systemType,
          grades: normalizedGrades,
        },
      })
    }
  } catch (err: unknown) {
    sendError(res, 'FETCH_CURRENT_GRADES', err, 'FETCH_ERROR')
  }
})

router.get('/transcript', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  try {
    let transcript: object

    if (entry.session.systemType === 'HAC') {
      transcript = await hacTranscript(entry.token)
    } else {
      transcript = await psTranscript(entry.token)
    }

    res.json({
      data: {
        systemType: entry.session.systemType,
        transcript,
      },
    })
  } catch (err: unknown) {
    sendError(res, 'FETCH_TRANSCRIPT', err, 'FETCH_ERROR')
  }
})

router.get('/schedule', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({
      data: null,
      error: {
        code: 'UNSUPPORTED',
        message: 'Schedule is only available for HAC districts',
      },
    })

    return
  }

  try {
    const schedule = await getSchedule(entry.token)

    res.json({
      data: {
        schedule,
      },
    })
  } catch (err: unknown) {
    sendError(res, 'FETCH_SCHEDULE', err, 'FETCH_ERROR')
  }
})

router.get('/gpa', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  try {
    let rawGrades: Array<{ average: string | null; grade?: string | null }>

    if (entry.session.systemType === 'HAC') {
      rawGrades = await hacGrades(entry.token)
    } else {
      const ps = await psGrades(entry.token)
      rawGrades = ps.map(c => ({ average: c.grade }))
    }

    const gpa = computeGPA(rawGrades)

    res.json({
      data: {
        gpa,
        courseCount: rawGrades.length,
        systemType: entry.session.systemType,
      },
    })
  } catch (err: unknown) {
    sendError(res, 'FETCH_GPA', err, 'FETCH_ERROR')
  }
})

router.get('/info', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({
      data: null,
      error: {
        code: 'UNSUPPORTED',
        message: 'Student info lookup is only available for HAC districts',
      },
    })

    return
  }

  try {
    const info = await getStudentInfo(entry.token)

    res.json({
      data: info,
    })
  } catch (err: unknown) {
    sendError(res, 'FETCH_STUDENT_INFO', err, 'FETCH_ERROR')
  }
})

router.delete('/session', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!
  deleteSessionByUserId(userId)

  // Clear cached session from DB so the status route doesn't auto-restore it
  try {
    await prisma.schoolConnection.updateMany({
      where: { userId },
      data: { cachedSession: null },
    })
  } catch (err) {
    console.warn('[GRADES ROUTER] Non-fatal: failed to clear cached session on disconnect:',
      err instanceof Error ? err.message : String(err))
  }

  res.json({
    data: {
      disconnected: true,
    },
  })
})

router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!

  let entry = getSessionByUserId(userId)

  // If no in-memory session, try to restore from DB cache
  if (!entry) {
    const cachedConnection = await prisma.schoolConnection.findUnique({ where: { userId } })

    if (cachedConnection?.cachedSession) {
      console.log('[GRADES ROUTER] Attempting session restore from DB cache for userId:', userId)
      const restoredToken = restoreSessionFromCache(
        userId,
        cachedConnection.systemType as SchoolSystemType,
        cachedConnection.districtUrl,
        cachedConnection.cachedSession
      )
      if (restoredToken) {
        entry = getSessionByUserId(userId)
        console.log('[GRADES ROUTER] Session restored from cache:', Boolean(entry))
      }
    }
  }

  const connection = await prisma.schoolConnection.findUnique({
    where: { userId },
  })

  // Consider the portal "connected" if a SchoolConnection record exists
  // (user has linked their portal at least once), even if the in-memory
  // session expired. This prevents the UI from asking the user to
  // reconnect every time the backend restarts.
  const isConnected = Boolean(entry) || Boolean(connection)

  res.json({
    data: {
      connected: isConnected,
      systemType: entry?.session.systemType ?? connection?.systemType ?? null,
      districtUrl: entry?.session.baseUrl ?? connection?.districtUrl ?? null,
      lastSynced: connection?.lastSynced ?? null,
      sessionExpiresIn: entry
        ? Math.max(0, Math.floor((entry.session.expiresAt - Date.now()) / 1000))
        : 0,
    },
  })
})

export default router