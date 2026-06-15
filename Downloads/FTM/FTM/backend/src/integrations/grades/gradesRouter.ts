import { Router, Response, NextFunction, Request } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../../middleware/auth'
import {
  loginHAC,
  getGrades as hacGrades,
  getTranscript as hacTranscript,
  getSchedule,
  getStudentInfo,
  getReportCard,
  getProgressReport,
  getContactTeachers,
  getAttendance,
} from './hacClient'
import {
  loginPowerSchool,
  getGrades as psGrades,
  getTranscript as psTranscript,
} from './powerSchoolClient'
import { buildSessionWithCLCookie } from './classLinkHelper'
import { getSessionByUserId, getSessionByToken, deleteSessionByUserId, restoreSessionFromCache, touchSession, type SchoolSystemType } from './sessionStore'
import { prisma } from '../../lib/prisma'
import { APIError, AuthenticationError } from './errors'
import { normalizeHacGrades, normalizePsGrades } from './normalizeGrades'
import { encryptPassword, decryptPassword } from './credentialCrypto'

const router = Router()

// ── URL normalizer (mirrors extractOrigin in hacClient) ───────────────────────
// Ensures the baseUrl stored in the session always ends with a trailing slash
// so that all scraping functions can safely do `${origin}HomeAccess/...`.
// Without this, a stored URL like "https://homeaccess.katyisd.org" (no slash)
// produces "https://homeaccess.katyisd.orghomeaccess/..." → ENOTFOUND.
function toOrigin(url: string): string {
  try {
    const u = new URL(url.trim())
    return `${u.protocol}//${u.host}/`
  } catch {
    const m = url.trim().match(/^(https?:\/\/[^/?#]+)/)
    return m ? `${m[1]}/` : url
  }
}

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
  // Typed errors carry their own status — use it directly
  const status = err instanceof APIError ? err.status : statusFromError(details.message, details.status)

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
      code: err instanceof AuthenticationError ? 'AUTH_ERROR' : fallbackCode,
      message: details.message,
      details: {
        code: details.code,
        status: details.status,
        responseData: details.responseData,
      },
    },
  })
}

// asyncHandler: ensures uncaught async errors always produce JSON + correct CORS headers.
// Login/session pattern adapted from gradexis-api (Apache-2.0): github.com/ruskcoder/gradexis-api
function asyncHandler(
  fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthRequest, res, next)).catch(err => {
      if (!res.headersSent) {
        const status = err instanceof APIError ? err.status : 500
        res.status(status).json({
          data: null,
          error: {
            code: err instanceof AuthenticationError ? 'AUTH_ERROR' : 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : 'Internal server error',
          },
        })
      }
    })
  }
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

// ── Auto-relogin using stored credentials ─────────────────────────────────────
// When the HAC/PS session expires (~60 min), silently re-login using the
// encrypted credentials stored in SchoolConnection so the user never has
// to re-enter their portal password.

async function autoRelogin(userId: number): Promise<{ token: string; session: ReturnType<typeof getSessionByUserId> } | null> {
  const connection = await prisma.schoolConnection.findUnique({ where: { userId } }).catch(() => null)
  if (!connection) return null

  // Determine which credentials to use
  const isHAC = connection.systemType === 'HAC'
  const username = connection.hacUsername
  const encryptedPassword = connection.encryptedPassword

  if (!username || !encryptedPassword) {
    console.log('[GRADES ROUTER] No stored credentials for auto-relogin, userId:', userId)
    return null
  }

  let password: string
  try {
    password = decryptPassword(encryptedPassword)
  } catch (e) {
    console.warn('[GRADES ROUTER] Failed to decrypt stored password:', e instanceof Error ? e.message : String(e))
    return null
  }

  console.log('[GRADES ROUTER] Attempting auto-relogin for userId:', userId, 'system:', connection.systemType)

  try {
    const origin = toOrigin(connection.districtUrl)
    let sessionToken: string

    if (isHAC) {
      sessionToken = await loginHAC(origin, username, password, userId)
    } else {
      sessionToken = await loginPowerSchool(origin, username, password, userId)
    }

    // Persist the fresh session cookie to DB
    const stored = getSessionByToken(sessionToken)
    if (stored) {
      await prisma.schoolConnection.update({
        where: { userId },
        data: { cachedSession: stored.sessionData, lastSynced: new Date() },
      }).catch(e => console.warn('[GRADES ROUTER] Non-fatal: failed to persist relogin session:', e instanceof Error ? e.message : String(e)))
    }

    console.log('[GRADES ROUTER] Auto-relogin successful for userId:', userId)
    const entry = getSessionByUserId(userId)
    return { token: sessionToken, session: entry }
  } catch (e) {
    console.warn('[GRADES ROUTER] Auto-relogin failed for userId:', userId, ':', e instanceof Error ? e.message : String(e))
    return null
  }
}

// ── Session resolution with DB fallback + auto-relogin ───────────────────────
// Priority: in-memory session → auto-relogin → DB cache restore → error
// When the in-memory session is gone (backend restart or expired), we try
// auto-relogin first because the DB-cached cookie jar is almost certainly
// expired on HAC's side (~60 min TTL). Only if relogin fails do we fall
// back to restoring the cached cookie as a last resort.

async function resolveSession(userId: number, res: Response): Promise<ReturnType<typeof getSessionByUserId>> {
  // 1. Fast path: in-memory session is still valid
  let entry = getSessionByUserId(userId)
  if (entry) return entry

  // 2. No in-memory session → try auto-relogin with stored credentials
  const reloginResult = await autoRelogin(userId)
  if (reloginResult?.session) {
    entry = reloginResult.session
    if (entry) return entry
  }

  // 3. Auto-relogin failed → last resort: try restoring from DB-cached cookie
  const connection = await prisma.schoolConnection.findUnique({ where: { userId } }).catch(() => null)
  if (connection?.cachedSession) {
    console.log('[GRADES ROUTER] Last resort: restoring session from DB cache for userId:', userId)
    const restoredToken = restoreSessionFromCache(
      userId,
      connection.systemType as SchoolSystemType,
      toOrigin(connection.districtUrl),
      connection.cachedSession,
    )
    if (restoredToken) entry = getSessionByUserId(userId)
  }

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

// ── Staleness threshold ────────────────────────────────────────────────────────
const SYNC_STALE_MS = 15 * 60 * 1000 // 15 minutes

function isCacheStale(lastSynced: Date | null): boolean {
  if (!lastSynced) return true
  return Date.now() - lastSynced.getTime() > SYNC_STALE_MS
}

// ── Background grade sync ──────────────────────────────────────────────────────
// Fired without await after /hac/login responds. Updates syncStatus on
// SchoolConnection so the client can poll GET /sync-status.
async function runBackgroundSync(userId: number, sessionToken: string): Promise<void> {
  console.log('[GRADES ROUTER] Background sync starting for userId:', userId)

  // Persist session cookie immediately so restart-recovery works even if sync fails
  try {
    const stored = getSessionByToken(sessionToken)
    if (stored) {
      await prisma.schoolConnection.update({
        where: { userId },
        data: { cachedSession: stored.sessionData },
      })
    }
  } catch (e) {
    console.warn('[GRADES ROUTER] Background sync: could not persist session:', e instanceof Error ? e.message : String(e))
  }

  // Staleness check — skip re-scrape if data is fresh
  const connection = await prisma.schoolConnection.findUnique({ where: { userId } }).catch(() => null)
  if (connection && !isCacheStale(connection.lastSynced)) {
    console.log('[GRADES ROUTER] Background sync skipped — data fresh, last synced:', connection.lastSynced)
    await prisma.schoolConnection.update({ where: { userId }, data: { syncStatus: 'complete' } }).catch(() => {})
    return
  }

  // Mark sync in progress
  await prisma.schoolConnection.update({
    where: { userId },
    data: { syncStatus: 'syncing', syncError: null },
  }).catch(() => {})

  try {
    const entry = getSessionByUserId(userId)
    if (!entry) throw new Error('Session expired before sync could run')

    if (entry.session.systemType === 'HAC') {
      // Sync student info into User + Profile
      try {
        const studentInfo = await getStudentInfo(sessionToken)
        if (studentInfo.name?.trim()) {
          await prisma.user.update({ where: { id: userId }, data: { name: studentInfo.name.trim() } })
          console.log('[GRADES ROUTER] Background sync: updated user name:', studentInfo.name.trim())
        }
        const profileUpdate: Record<string, unknown> = {}
        if (studentInfo.counselor?.trim()) profileUpdate.counselorName = studentInfo.counselor.trim()
        const cohortNum = studentInfo.cohortYear ? parseInt(studentInfo.cohortYear.replace(/\D/g, ''), 10) : NaN
        if (!isNaN(cohortNum) && cohortNum > 2000 && cohortNum < 2060) profileUpdate.graduationYear = cohortNum
        if (Object.keys(profileUpdate).length > 0) {
          await prisma.profile.upsert({ where: { userId }, create: { userId, ...profileUpdate }, update: profileUpdate })
        }
      } catch (infoErr) {
        console.warn('[GRADES ROUTER] Background sync: student info fetch failed (non-fatal):',
          infoErr instanceof Error ? infoErr.message : String(infoErr))
      }

      // Sync upcoming assignments from HAC grades
      const { classes: rawHacGrades } = await hacGrades(entry.token)
      const normalizedGrades = normalizeHacGrades(rawHacGrades)
      const upcomingToSync = normalizedGrades.flatMap(course =>
        (course.upcomingAssignments ?? []).map(a => ({
          userId,
          title: a.name,
          subject: course.name,
          dueDate: a.dateDue
            ? (() => { const p = new Date(a.dateDue); return isNaN(p.getTime()) ? new Date(Date.now() + 7 * 86400000) : p })()
            : new Date(Date.now() + 7 * 86400000),
          estimatedMinutes: 30,
        }))
      )
      for (const assignment of upcomingToSync) {
        await prisma.assignment.upsert({
          where: { userId_title_subject: { userId: assignment.userId, title: assignment.title, subject: assignment.subject } },
          update: { dueDate: assignment.dueDate },
          create: { ...assignment, completed: false },
        }).catch(async () => {
          const existing = await prisma.assignment.findFirst({
            where: { userId: assignment.userId, title: assignment.title, subject: assignment.subject },
          })
          if (!existing) await prisma.assignment.create({ data: { ...assignment, completed: false } })
        })
      }
      console.log(`[GRADES ROUTER] Background sync: synced ${upcomingToSync.length} assignments for userId:`, userId)
    }

    await prisma.schoolConnection.update({
      where: { userId },
      data: { syncStatus: 'complete', syncError: null, lastSynced: new Date() },
    }).catch(() => {})
    console.log('[GRADES ROUTER] Background sync complete for userId:', userId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GRADES ROUTER] Background sync failed for userId:', userId, ':', msg)
    await prisma.schoolConnection.update({
      where: { userId },
      data: { syncStatus: 'error', syncError: msg },
    }).catch(() => {})
  }
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

    // Block if another account already owns this school username
    const taken = await prisma.schoolConnection.findFirst({
      where: {
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
        hacUsername: username,
        NOT: { userId },
      },
    })
    if (taken) {
      res.status(409).json({
        data: null,
        error: {
          code: 'SCHOOL_ACCOUNT_TAKEN',
          message: 'This school account is already linked to another NextStep account. Each school ID can only be used once.',
        },
      })
      return
    }

    // Encrypt and store the HAC password for auto-relogin when sessions expire
    let encryptedPassword: string | null = null
    try {
      encryptedPassword = encryptPassword(password)
    } catch (e) {
      console.warn('[GRADES ROUTER] Non-fatal: could not encrypt HAC password:', e instanceof Error ? e.message : String(e))
    }

    await prisma.schoolConnection.upsert({
      where: { userId },
      update: {
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
        hacUsername: username,
        ...(encryptedPassword ? { encryptedPassword: encryptedPassword } : {}),
        lastSynced: new Date(),
      },
      create: {
        userId,
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
        hacUsername: username,
        ...(encryptedPassword ? { encryptedPassword: encryptedPassword } : {}),
      },
    })

    // Auto-assign developer role if recognized HAC username
    const DEV_USERNAMES = ['K2008105', 'K2308016']
    if (DEV_USERNAMES.includes(username.trim())) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            role: 'ADMIN',
            tag: 'DEV',
            tagColor: 'lightblue',
          },
        })
        console.log('[GRADES ROUTER] Auto-assigned DEV role + tag for HAC user:', username)
      } catch (devErr) {
        console.warn('[GRADES ROUTER] Non-fatal: could not assign DEV role:', devErr instanceof Error ? devErr.message : String(devErr))
      }
    }

    // Respond immediately — all remaining work (session cache, student info, grade sync)
    // runs in the background so the client is not blocked by HAC scraping.
    res.json({
      data: {
        sessionToken,
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
        expiresIn: 1800,
      },
    })

    // Fire-and-forget: persist session + sync grades in background
    runBackgroundSync(userId, sessionToken).catch(e =>
      console.error('[GRADES ROUTER] Unhandled background sync error:', e instanceof Error ? e.message : String(e))
    )
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

    // Encrypt and store the PowerSchool password for auto-relogin when sessions expire
    let encryptedPsPassword: string | null = null
    try {
      encryptedPsPassword = encryptPassword(password)
    } catch (e) {
      console.warn('[GRADES ROUTER] Non-fatal: could not encrypt PS password:', e instanceof Error ? e.message : String(e))
    }

    await prisma.schoolConnection.upsert({
      where: { userId },
      update: {
        systemType: 'PowerSchool',
        districtUrl: baseUrl,
        ...(encryptedPsPassword ? { encryptedPassword: encryptedPsPassword } : {}),
        lastSynced: new Date(),
      },
      create: {
        userId,
        systemType: 'PowerSchool',
        districtUrl: baseUrl,
        ...(encryptedPsPassword ? { encryptedPassword: encryptedPsPassword } : {}),
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
  const entry = await resolveSession(userId, res)
  if (!entry) return

  try {
    // Extend session on successful access
    touchSession(userId)

    if (entry.session.systemType === 'HAC') {
      const { classes: rawHacGrades } = await hacGrades(entry.token)
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
  const entry = await resolveSession(req.userId!, res)
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
  const entry = await resolveSession(req.userId!, res)
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
  const entry = await resolveSession(req.userId!, res)
  if (!entry) return

  try {
    let unweightedGpa: number | null = null
    let weightedGpa: number | null = null
    let courseCount = 0

    if (entry.session.systemType === 'HAC') {
      // Pull the real cumulative GPAs that HAC calculates and displays on the transcript page
      const transcript = await hacTranscript(entry.token)
      const t = transcript as { weightedGPA?: string | null; unweightedGPA?: string | null; semesters?: Array<{ courses: unknown[] }> }

      const w = parseFloat(t.weightedGPA ?? '')
      const u = parseFloat(t.unweightedGPA ?? '')
      if (!isNaN(w)) weightedGpa   = Math.round(w * 100) / 100
      if (!isNaN(u)) unweightedGpa = Math.round(u * 100) / 100

      courseCount = (t.semesters ?? []).reduce((acc, s) => acc + (s.courses?.length ?? 0), 0)
    } else {
      const ps = await psGrades(entry.token)
      courseCount = ps.length
      const rawGrades = ps.map(c => ({ average: c.grade }))
      const gpa = computeGPA(rawGrades)
      unweightedGpa = gpa
      weightedGpa   = gpa
    }

    res.json({
      data: {
        gpa: unweightedGpa,
        unweightedGpa,
        weightedGpa,
        courseCount,
        systemType: entry.session.systemType,
      },
    })
  } catch (err: unknown) {
    sendError(res, 'FETCH_GPA', err, 'FETCH_ERROR')
  }
})

router.get('/info', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await resolveSession(req.userId!, res)
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
        toOrigin(cachedConnection.districtUrl),
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

router.get('/sync-status', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!
  const connection = await prisma.schoolConnection.findUnique({
    where: { userId },
    select: { syncStatus: true, syncError: true, lastSynced: true },
  }).catch(() => null)

  if (!connection) {
    res.json({ data: { status: 'idle', lastSyncedAt: null, errorMessage: null } })
    return
  }

  res.json({
    data: {
      status: connection.syncStatus ?? 'idle',
      lastSyncedAt: connection.lastSynced ?? null,
      errorMessage: connection.syncError ?? null,
    },
  })
})

router.get('/classwork', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await resolveSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({ data: null, error: { code: 'UNSUPPORTED', message: 'Classwork is only available for HAC districts' } })
    return
  }

  try {
    touchSession(req.userId!)
    const period = req.query.period as string | undefined
    const { classes, availablePeriods, currentPeriod } = await hacGrades(entry.token, period)
    res.json({ data: { classes, availablePeriods, currentPeriod } })
  } catch (err: unknown) {
    sendError(res, 'FETCH_CLASSWORK', err, 'FETCH_ERROR')
  }
})

router.get('/report-card', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await resolveSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({ data: null, error: { code: 'UNSUPPORTED', message: 'Report card is only available for HAC districts' } })
    return
  }

  try {
    touchSession(req.userId!)
    const period = req.query.period as string | undefined
    const { reportingPeriods, currentPeriod, semesters } = await getReportCard(entry.token, period)
    res.json({ data: { reportingPeriods, currentPeriod, semesters } })
  } catch (err: unknown) {
    sendError(res, 'FETCH_REPORT_CARD', err, 'FETCH_ERROR')
  }
})

router.get('/progress-report', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await resolveSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({ data: null, error: { code: 'UNSUPPORTED', message: 'Progress report is only available for HAC districts' } })
    return
  }

  try {
    touchSession(req.userId!)
    const date = req.query.date as string | undefined
    const data = await getProgressReport(entry.token, date)
    res.json({ data })
  } catch (err: unknown) {
    sendError(res, 'FETCH_PROGRESS_REPORT', err, 'FETCH_ERROR')
  }
})

router.get('/attendance', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await resolveSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({ data: null, error: { code: 'UNSUPPORTED', message: 'Attendance is only available for HAC districts' } })
    return
  }

  try {
    touchSession(req.userId!)
    const offset = parseInt(String(req.query.monthOffset ?? '0')) || 0
    const data = await getAttendance(entry.token, offset)
    res.json({ data })
  } catch (err: unknown) {
    sendError(res, 'FETCH_ATTENDANCE', err, 'FETCH_ERROR')
  }
})

router.get('/contact-teachers', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await resolveSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({ data: null, error: { code: 'UNSUPPORTED', message: 'Contact teachers is only available for HAC districts' } })
    return
  }

  try {
    touchSession(req.userId!)
    const data = await getContactTeachers(entry.token)
    res.json({ data })
  } catch (err: unknown) {
    sendError(res, 'FETCH_CONTACT_TEACHERS', err, 'FETCH_ERROR')
  }
})

// ── Re-sync student profile from HAC (counselor, graduation year, name) ────
router.post('/sync-profile', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!
  const entry = await resolveSession(userId, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({
      data: null,
      error: { code: 'UNSUPPORTED', message: 'Profile sync is only available for HAC districts' },
    })
    return
  }

  try {
    touchSession(userId)
    console.log('[GRADES ROUTER] Re-syncing profile from HAC for userId:', userId)

    const studentInfo = await getStudentInfo(entry.token)
    const profileUpdate: Record<string, unknown> = {}
    const userUpdate: Record<string, unknown> = {}

    // Update name from HAC
    if (studentInfo.name?.trim()) {
      userUpdate.name = studentInfo.name.trim()
    }

    // Update counselor from HAC
    if (studentInfo.counselor?.trim()) {
      profileUpdate.counselorName = studentInfo.counselor.trim()
    }

    // Parse and update graduation year from HAC cohort year
    const cohortNum = studentInfo.cohortYear ? parseInt(studentInfo.cohortYear.replace(/\D/g, ''), 10) : NaN
    if (!isNaN(cohortNum) && cohortNum > 2000 && cohortNum < 2060) {
      profileUpdate.graduationYear = cohortNum
    }

    // Update grade level from HAC if available
    const gradeNum = studentInfo.grade ? parseInt(studentInfo.grade.replace(/\D/g, ''), 10) : NaN
    if (!isNaN(gradeNum) && gradeNum >= 1 && gradeNum <= 12) {
      profileUpdate.gradeLevel = gradeNum
    }

    // Apply user updates (name)
    if (Object.keys(userUpdate).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: userUpdate })
      console.log('[GRADES ROUTER] Synced user from HAC:', userUpdate)
    }

    // Apply profile updates (counselor, graduation year, grade level)
    // Note: satScore, actScore, futureDecision are NOT overwritten — those are user-set
    let syncedProfile: Record<string, unknown> | null = null
    if (Object.keys(profileUpdate).length > 0) {
      syncedProfile = await prisma.profile.upsert({
        where: { userId },
        create: { userId, ...profileUpdate },
        update: profileUpdate,
      }) as Record<string, unknown>
      console.log('[GRADES ROUTER] Synced profile from HAC:', profileUpdate)
    }

    // Get the updated user name
    const updatedUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })

    res.json({
      data: {
        synced: true,
        name: updatedUser?.name ?? null,
        profile: syncedProfile,
        studentInfo: {
          name: studentInfo.name,
          grade: studentInfo.grade,
          school: studentInfo.school,
          district: studentInfo.district,
          counselor: studentInfo.counselor,
          cohortYear: studentInfo.cohortYear,
        },
      },
    })
  } catch (err: unknown) {
    sendError(res, 'SYNC_PROFILE', err, 'SYNC_ERROR')
  }
})

export default router
