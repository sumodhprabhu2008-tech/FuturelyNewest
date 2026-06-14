/**
 * HAC (Home Access Center) scraping client.
 * Debug-friendly version for NextStep local beta.
 */

import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { saveSession, getSessionByToken, StoredSession } from './sessionStore'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function dumpDebugHtml(filename: string, html: string): void {
  try {
    const debugPath = path.resolve(__dirname, '..', '..', `debug_${filename}.html`)
    fs.writeFileSync(debugPath, html, 'utf8')
    console.log(`[DEBUG] Wrote ${debugPath}`)
  } catch { /* ignore */ }
}

export interface HACClass {
  name: string
  period: string
  teacher: string
  room: string
  average: string | null
  scores: HACScore[]
}

export interface HACScore {
  name: string
  category: string
  score: number | null
  totalPoints: number | null
  percentage: string
  dateDue: string
}

export interface HACStudentInfo {
  name: string
  grade: string
  school: string
  district: string
  counselor: string
  cohortYear: string
}

export interface HACTranscriptEntry {
  year: string
  semester: string
  courses: Array<{ name: string; grade: string; credits: string }>
}

export interface HACTranscript {
  semesters: HACTranscriptEntry[]
  cumulativeGPA: string | null
  weightedGPA: string | null
  unweightedGPA: string | null
  classRank: string | null
  quartile: string | null
}

// ── Error helper ──────────────────────────────────────────────────────────────

function getAxiosErrorDetails(err: unknown): {
  message: string
  code?: string
  status?: number
  responseData?: unknown
  url?: string
  method?: string
} {
  const anyErr = err as {
    message?: string
    code?: string
    response?: {
      status?: number
      data?: unknown
    }
    config?: {
      url?: string
      method?: string
    }
  }

  return {
    message: anyErr?.message ?? 'Unknown error',
    code: anyErr?.code,
    status: anyErr?.response?.status,
    responseData: anyErr?.response?.data,
    url: anyErr?.config?.url,
    method: anyErr?.config?.method,
  }
}

function throwDetailedAxiosError(label: string, err: unknown): never {
  const details = getAxiosErrorDetails(err)

  console.error(`[HAC CLIENT] ${label} failed`, {
    message: details.message,
    code: details.code,
    status: details.status,
    url: details.url,
    method: details.method,
    responsePreview:
      typeof details.responseData === 'string'
        ? details.responseData.slice(0, 1000)
        : details.responseData,
  })

  if (details.code === 'ENOTFOUND') {
    throw new Error(`Cannot reach HAC URL. DNS lookup failed for ${details.url ?? 'unknown URL'}`)
  }

  if (details.code === 'ECONNREFUSED') {
    throw new Error(`Connection refused by HAC at ${details.url ?? 'unknown URL'}`)
  }

  if (details.code === 'ETIMEDOUT' || details.code === 'ECONNABORTED') {
    throw new Error(`Connection timed out while contacting HAC at ${details.url ?? 'unknown URL'}`)
  }

  if (details.status) {
    throw new Error(
      `HAC request failed with HTTP ${details.status} at ${details.url ?? 'unknown URL'}`,
    )
  }

  throw new Error(
    `HAC request failed: ${details.message}${details.code ? ` (${details.code})` : ''}`,
  )
}

// ── Session helpers ───────────────────────────────────────────────────────────

function makeAxiosSession() {
  const jar = new CookieJar()

  const client = axios.create({
    withCredentials: true,
    jar,
    timeout: 45_000,
    maxRedirects: 10,
    validateStatus: status => status >= 200 && status < 500,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  return {
    jar,
    http: wrapper(client),
  }
}

function serializeJar(jar: CookieJar): string {
  return JSON.stringify(jar.toJSON())
}

function deserializeJar(raw: string): CookieJar {
  return CookieJar.fromJSON(JSON.parse(raw)) as CookieJar
}

function restoreSession(stored: StoredSession) {
  const jar = deserializeJar(stored.sessionData)

  const client = axios.create({
    withCredentials: true,
    jar,
    timeout: 45_000,
    maxRedirects: 10,
    validateStatus: status => status >= 200 && status < 500,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  return {
    jar,
    http: wrapper(client),
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

/**
 * Extract just the protocol + hostname from any URL.
 * Used for building scraping URLs — never for the login URL itself.
 * Example: 'https://homeaccess.katyisd.org/HomeAccess/Account/LogOn?...'
 *       → 'https://homeaccess.katyisd.org/'
 */
function extractOrigin(url: string): string {
  try {
    const parsed = new URL(url.trim())
    return `${parsed.protocol}//${parsed.host}/`
  } catch {
    const match = url.trim().match(/^(https?:\/\/[^/?#]+)/)
    return match ? `${match[1]}/` : url
  }
}

function getFormAction($: cheerio.CheerioAPI, fallbackUrl: string): string {
  const action = $('form').first().attr('action')

  if (!action) return fallbackUrl

  // Resolve absolute URLs, absolute paths, and relative paths against the
  // login page URL — handles SSO-bypass URLs that include a query string.
  try {
    return new URL(action, fallbackUrl).toString()
  } catch {
    return fallbackUrl
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export async function loginHAC(
  baseUrl: string,
  username: string,
  password: string,
  userId: number,
  clsessionCookie?: string,
): Promise<string> {
  const link = normalizeBaseUrl(baseUrl)
  const origin = extractOrigin(baseUrl) // e.g. https://homeaccess.katyisd.org/
  const { jar, http } = makeAxiosSession()

  console.log('[HAC CLIENT] loginHAC started', {
    baseUrl,
    link,
    origin,
    userId,
    usernameExists: Boolean(username),
    passwordExists: Boolean(password),
    hasClSessionCookie: Boolean(clsessionCookie),
  })

  if (clsessionCookie) {
    await jar.setCookie(
      `clsession=${clsessionCookie}; Domain=.classlink.com; Path=/`,
      'https://classlink.com',
    )
  }

  // If the user pasted the full SSO-bypass login URL (e.g. Katy ISD's
  // .../HomeAccess/Account/LogOn?ReturnUrl=...), use it exactly as given so
  // HAC shows the direct username/password form. Otherwise build the
  // standard login URL from the base.
  const loginPageUrl = /Account\/Log[Oo]n/.test(baseUrl)
    ? baseUrl.trim()
    : `${link}HomeAccess/Account/LogOn`

  let loginPageHtml: string

  try {
    console.log('[HAC CLIENT] Fetching login page:', loginPageUrl)

    const res = await http.get(loginPageUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
    })

    console.log('[HAC CLIENT] Login page fetched', {
      status: res.status,
      finalUrl: res.request?.res?.responseUrl,
      htmlLength: typeof res.data === 'string' ? res.data.length : 0,
    })

    loginPageHtml = res.data as string
  } catch (err: unknown) {
    throwDetailedAxiosError('fetch login page', err)
  }

  const $ = cheerio.load(loginPageHtml)

  const verificationToken =
    $("input[name='__RequestVerificationToken']").val() as string | undefined

  console.log('[HAC CLIENT] Verification token found:', Boolean(verificationToken))

  if (!verificationToken) {
    const title = $('title').text().trim()
    const bodyPreview = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 500)

    console.error('[HAC CLIENT] Login form not found', {
      title,
      bodyPreview,
    })

    console.error('[HAC CLIENT] Page HTML (first 3000 chars):', loginPageHtml.slice(0, 3000))

    throw new Error(
      `Could not find login form on HAC page. Page title: ${title || 'unknown'}. The district may use SSO/ClassLink or a different login URL.`,
    )
  }

  const formData = new URLSearchParams()

  $('form input').each((_i, input) => {
    const name = $(input).attr('name')
    const value = $(input).attr('value') ?? ''

    if (name) {
      formData.set(name, value)
    }
  })

  formData.set('__RequestVerificationToken', verificationToken)
  formData.set('VerificationOption', 'UsernamePassword')
  // Set both dot-notation (ASP.NET MVC model binding) and underscore-notation (HTML ID form)
  formData.set('LogOnDetails.UserName', username)
  formData.set('LogOnDetails.Password', password)
  formData.set('LogOnDetails_UserName', username)
  formData.set('LogOnDetails_Password', password)
  // Some HAC implementations use tempUN/tempPW as intermediate fields
  if (formData.has('tempUN')) formData.set('tempUN', username)
  if (formData.has('tempPW')) formData.set('tempPW', password)

  if (!formData.has('Database')) {
    formData.set('Database', '10')
  }

  console.log('[HAC CLIENT] Login form fields:', Array.from(formData.keys()))

  const loginPostUrl = getFormAction($, loginPageUrl)

  try {
    console.log('[HAC CLIENT] Posting HAC login form:', loginPostUrl)

    const postRes = await http.post(loginPostUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: origin.replace(/\/$/, ''),
        Referer: loginPageUrl,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      maxRedirects: 10,
      validateStatus: (status: number) => status >= 200 && status < 500,
    })

    const postFinalUrl: string =
      (postRes.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? loginPostUrl
    const postHtml = postRes.data as string
    const $post = cheerio.load(postHtml)
    const postTitle = $post('title').text().trim()
    const postBodyPreview = $post('body').text().replace(/\s+/g, ' ').trim().slice(0, 500)

    console.log('[HAC CLIENT] Login POST completed', {
      status: postRes.status,
      finalUrl: postFinalUrl,
      htmlLength: typeof postHtml === 'string' ? postHtml.length : 0,
      title: postTitle,
      bodyPreview: postBodyPreview,
    })

    if (postRes.status >= 500) {
      throw new Error(`HAC login POST returned HTTP ${postRes.status}. Title: ${postTitle || 'unknown'}.`)
    }

    // Explicit credential rejection messages
    if (
      postHtml.includes('Invalid user name or password') ||
      postHtml.includes('Invalid username or password') ||
      postHtml.includes('The user name or password is incorrect') ||
      postHtml.includes('Login was unsuccessful')
    ) {
      throw new Error('Invalid credentials — HAC rejected the username or password')
    }

    const isStillOnLoginPage =
      postFinalUrl.includes('Account/LogOn') || postFinalUrl.includes('Account/Login')

    if (!isStillOnLoginPage) {
      console.log('[HAC CLIENT] POST redirected to non-login page:', postFinalUrl)
    }

    // Always verify session by navigating to a protected page.
    // Use the Demographic page — the normal authenticated landing page on
    // new PowerSchool HAC. (Home.aspx no longer exists and redirects to /Error,
    // which previously caused false "invalid credentials" failures.)
    const homeUrl = `${origin}HomeAccess/Registration/Demographic`
    console.log('[HAC CLIENT] Verifying session via Demographic page:', homeUrl)

    const homeRes = await http.get(homeUrl, {
      headers: { Referer: loginPostUrl },
      validateStatus: (status: number) => status >= 200 && status < 500,
    })

    const homeBody = homeRes.data as string
    const homeFinalUrl: string =
      (homeRes.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? homeUrl

    console.log('[HAC CLIENT] Demographic verification response', {
      status: homeRes.status,
      finalUrl: homeFinalUrl,
      htmlLength: typeof homeBody === 'string' ? homeBody.length : 0,
      bodyPreview: typeof homeBody === 'string' ? homeBody.slice(0, 500) : '',
    })

    const homeRedirectedToLogin =
      homeFinalUrl.includes('Account/LogOn') || homeFinalUrl.includes('Account/Login')

    if (homeRedirectedToLogin) {
      throw new Error('Invalid credentials — HAC rejected the username or password')
    }

    // A redirect to an error page is NOT proof of bad credentials (e.g. a
    // nonexistent page redirects to /Error even when authenticated). Only a
    // redirect back to the login page means the session was rejected — log
    // and let the cookie check below make the final call.
    if (homeFinalUrl.includes('/Error')) {
      console.warn('[HAC CLIENT] Verification page redirected to /Error — continuing; auth cookie check will decide')
    }

    // Content-based check: if Home.aspx still contains a login form, credentials failed.
    // This catches the case where HAC serves the page without a URL redirect but
    // renders an unauthenticated view with an embedded login form.
    if (typeof homeBody === 'string') {
      const $home = cheerio.load(homeBody)
      const hasLoginInput = $home(
        "input[name='LogOnDetails.UserName'], input[name='LogOnDetails_UserName'], input[name='tempUN']"
      ).length > 0

      if (hasLoginInput) {
        throw new Error('Invalid credentials — login form still present after authentication attempt')
      }
    }

    // Do NOT throw for the Demographic page — it is the normal authenticated
    // landing page for Katy ISD HAC after login.
    console.log('[HAC CLIENT] Login verified — landed on:', homeFinalUrl, '(Demographic page is normal)')
  } catch (err: unknown) {
    // Re-throw credential errors before the outer handler swallows them
    if (err instanceof Error && err.message.includes('Invalid credentials')) {
      throw err
    }
    if (err instanceof Error && err.message.includes('HAC login POST returned HTTP')) {
      throw err
    }
    throwDetailedAxiosError('submit login form', err)
  }

  const hacDomain = origin.replace(/\/$/, '')
  const allCookies = jar.getCookiesSync(hacDomain)
  console.log('[HAC CLIENT] Saving session — baseUrl (clean origin):', origin)
  console.log('[HAC CLIENT] Saving session — cookie lookup domain (no slash):', hacDomain)
  console.log('[HAC CLIENT] Saving session with cookies:', allCookies.map(c => ({ key: c.key, domain: c.domain })))

  // Final authentication check: standard HAC sets .ASPXAUTH; some districts set ASP.NET_SessionId.
  // If neither is present the login was rejected.
  const hasAspxAuth = allCookies.some(c => c.key === '.ASPXAUTH')
  const hasSessionCookie = allCookies.some(
    c =>
      c.key.toLowerCase().includes('aspxauth') ||
      c.key === 'ASP.NET_SessionId' ||
      c.key.toLowerCase().includes('session'),
  )

  if (!hasAspxAuth && !hasSessionCookie) {
    throw new Error('Invalid credentials — HAC did not set an authentication cookie')
  }
  if (!hasAspxAuth && hasSessionCookie) {
    console.warn('[HAC CLIENT] No .ASPXAUTH but session cookie found — proceeding')
    // home.aspx verification already confirmed authentication succeeded
  }

  // Save the CLEAN ORIGIN as the baseUrl — all scraping functions build their
  // URLs from this. The full SSO-bypass URL is only used for the login itself.
  const sessionToken = saveSession(userId, 'HAC', origin, serializeJar(jar))

  console.log('[HAC CLIENT] HAC session saved', {
    userId,
    hasSessionToken: Boolean(sessionToken),
  })

  return sessionToken
}

// ── ASP.NET ScriptManager delta (UpdatePanel AJAX) parser ─────────────────────
// HAC pages that use UpdatePanel return a delta string, not full HTML.
// Format: len|type|id|content| ... repeated
function parseScriptManagerDelta(delta: string): string {
  let pos = 0
  let bestHtml = ''
  while (pos < delta.length) {
    const p1 = delta.indexOf('|', pos)
    if (p1 === -1) break
    const len = parseInt(delta.substring(pos, p1))
    if (isNaN(len) || len < 0) break
    const p2 = delta.indexOf('|', p1 + 1)
    if (p2 === -1) break
    const type = delta.substring(p1 + 1, p2)
    const p3 = delta.indexOf('|', p2 + 1)
    if (p3 === -1) break
    const contentStart = p3 + 1
    if (contentStart + len > delta.length) break
    const content = delta.substring(contentStart, contentStart + len)
    if (type === 'updatePanel' && content.length > bestHtml.length) bestHtml = content
    pos = contentStart + len + 1
  }
  return bestHtml
}

// ── Scraping helpers ───────────────────────────────────────────────────────────

/**
 * Extract period from HAC class header.
 * Tries multiple selector strategies for district compatibility.
 */
function extractPeriod($el: cheerio.Cheerio<AnyNode>, $: cheerio.CheerioAPI): string {
  // Strategy 1: direct child class (standard Skyward)
  const direct = $el.find('.sg-header-period').text().replace(/Period/i, '').trim()
  if (direct) return direct

  // Strategy 2: header text contains "Period X"
  const headerText = $el.find('.sg-header-heading').text()
  const periodMatch = headerText.match(/Period\s*(\d+)/i)
  if (periodMatch?.[1]) return periodMatch[1]

  // Strategy 3: look for a parenthetical like "(1)" or "Pd 1"
  const pdMatch = headerText.match(/Pd\.?\s*(\d+)|\((\d+)\)/)
  if (pdMatch) return pdMatch[1] ?? pdMatch[2] ?? ''

  return ''
}

/**
 * Extract class average from HAC class header.
 * Tries multiple selector strategies.
 */
function extractAverage($el: cheerio.Cheerio<AnyNode>, $: cheerio.CheerioAPI): string | null {
  // Strategy 1: direct .sg-header-average class
  const direct = $el.find('.sg-header-average').text()
    .replace(/Student\s*Avg[:.]?\s*/i, '').trim()
  if (direct && direct !== '' && direct !== '--') return direct

  // Strategy 2: look for a percentage-like value in the header
  const headerText = $el.find('.sg-header-heading').text()
  const avgMatch = headerText.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%?$/)
  if (avgMatch?.[1]) {
    const num = parseFloat(avgMatch[1])
    if (!isNaN(num) && num >= 0 && num <= 100) return avgMatch[1]
  }

  // Strategy 3: look for "Avg:" text anywhere in the header
  const avgLabelMatch = headerText.match(/Avg[^:]*:\s*([\d.]+)/i)
  if (avgLabelMatch?.[1]) return avgLabelMatch[1]

  return null
}

// ── Data fetchers ──────────────────────────────────────────────────────────────

export interface HACGradesResult {
  classes: HACClass[]
  availablePeriods: string[]
  currentPeriod: string
}

export async function getGrades(sessionToken: string, period?: string): Promise<HACGradesResult> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired — please log in again')

  const { http } = restoreSession(stored)
  const origin = stored.baseUrl // already cleaned to https://hostname/

  // The correct URL for grades and classwork in PowerSchool HAC
  const classworkUrl = `${origin}HomeAccess/Classes/Classwork`

  console.log('[HAC CLIENT] Fetching classwork from:', classworkUrl)

  await sleep(800 + Math.random() * 400) // 0.8–1.2s delay
  const res = await http.get(classworkUrl, {
    headers: {
      Referer: `${origin}HomeAccess/Home.aspx`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
    },
  })

  const finalUrl = (res.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? ''
  const pageTitle = ('' + res.data).match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? ''

  console.log('[HAC CLIENT] Classwork page:', { finalUrl, pageTitle, htmlLength: (res.data as string).length })

  // If redirected to login, session expired
  if (finalUrl.includes('Account/LogOn') || finalUrl.includes('Account/Login')) {
    throw new Error('School session expired — please log in again')
  }

  const outerHtml = res.data as string
  const $outer = cheerio.load(outerHtml)

  // ── Step 1: Resolve the real content page (outer or iframe) ───────────────
  // Katy ISD HAC loads classwork (including the period dropdown) inside an
  // iframe. We must fetch the iframe first so we can find the dropdown there.
  let contentHtml = outerHtml
  let contentUrl  = classworkUrl

  const iframeSrc = $outer('iframe.sg-legacy-iframe, iframe[id*="legacy"], iframe[src*="Assignment"]').attr('src')
  if (iframeSrc && ($outer('.AssignmentClass').length === 0 && $outer('table').length === 0)) {
    contentUrl = iframeSrc.startsWith('http')
      ? iframeSrc
      : new URL(iframeSrc, classworkUrl).toString()

    console.log('[HAC CLIENT] Outer page is a shell — fetching iframe content:', contentUrl)
    try {
      await sleep(400 + Math.random() * 300)
      const iframeRes = await http.get(contentUrl, {
        headers: {
          Referer: classworkUrl,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })
      if (typeof iframeRes.data === 'string' && iframeRes.data.length > 500) {
        contentHtml = iframeRes.data
        console.log('[HAC CLIENT] Iframe content fetched:', { htmlLength: contentHtml.length })
      }
    } catch (iframeErr) {
      console.warn('[HAC CLIENT] Failed to fetch iframe content:',
        iframeErr instanceof Error ? iframeErr.message : String(iframeErr))
    }
  }

  let $content = cheerio.load(contentHtml)

  // ── Step 2: Extract grading period dropdown from the content page ──────────
  // Use SPECIFIC select selectors to avoid matching hidden inputs that share the same ID pattern.
  // We track both display text and raw value so the POST sends the right value to HAC.
  const PERIOD_SELECT_IDS = [
    'select#plnMain_ddlReportCardRuns',
    'select#plnMain_ddlGradePeriod',
    'select[id*="ddlReportCardRuns"]:not([type="hidden"])',
    'select[id*="ddlGradePeriod"]:not([type="hidden"])',
    'select[id*="ddlReportPeriod"]:not([type="hidden"])',
    'select[id*="ddlMarkingPeriod"]:not([type="hidden"])',
    'select[id*="ddlCycle"]:not([type="hidden"])',
    'select[id*="ddlGradesPeriod"]:not([type="hidden"])',
    'select[id*="ddlSixWeeks"]:not([type="hidden"])',
  ]
  const availablePeriods: string[] = []
  // Map display text → HAC option value (e.g., "1" → "1-2026")
  const periodValueMap: Record<string, string> = {}
  let currentPeriod = ''
  let periodDropdownName = ''
  let periodDropdownEl: string | null = null

  for (const sel of PERIOD_SELECT_IDS) {
    const $sel = $content(sel).first()
    if ($sel.length === 0) continue
    const opts: Array<{ text: string; value: string; selected: boolean }> = []
    $sel.find('option').each((_j, opt) => {
      const text  = $content(opt).text().trim()
      const value = ($content(opt).attr('value') ?? text).trim()
      const sel_  = $content(opt).attr('selected') !== undefined
      if (text) opts.push({ text, value, selected: sel_ })
    })
    if (opts.length > 0) {
      opts.forEach(o => {
        availablePeriods.push(o.text)
        periodValueMap[o.text] = o.value
        if (o.selected || !currentPeriod) currentPeriod = o.text
      })
      periodDropdownName = $sel.attr('name') ?? ''
      periodDropdownEl   = sel
      break
    }
  }

  // Fallback: scan ALL <select> for a grading-period-like dropdown
  if (availablePeriods.length === 0) {
    $content('select').each((_i, sel) => {
      const opts: Array<{ text: string; value: string; selected: boolean }> = []
      $content(sel).find('option').each((_j, opt) => {
        const text  = $content(opt).text().trim()
        const value = ($content(opt).attr('value') ?? text).trim()
        const sel_  = $content(opt).attr('selected') !== undefined
        if (text) opts.push({ text, value, selected: sel_ })
      })
      const looksLikePeriods = opts.length > 1 && opts.some(o =>
        /6\s*w(ee)?k|six\s*week|semester|quarter|marking|cycle|grading\s*period|\d(st|nd|rd|th)\s*period/i.test(o.text)
      )
      if (looksLikePeriods) {
        opts.forEach(o => {
          availablePeriods.push(o.text)
          periodValueMap[o.text] = o.value
          if (o.selected || !currentPeriod) currentPeriod = o.text
        })
        periodDropdownName = $content(sel).attr('name') ?? ''
        return false
      }
    })
  }

  if (availablePeriods.length === 0) {
    const allSelects: Array<{ id: string; name: string; options: string[] }> = []
    $content('select').each((_i, sel) => {
      const opts: string[] = []
      $content(sel).find('option').each((_j, opt) => { opts.push($content(opt).text().trim()) })
      allSelects.push({ id: $content(sel).attr('id') ?? '', name: $content(sel).attr('name') ?? '', options: opts })
    })
    console.log('[HAC CLIENT] No period dropdown found. All <select> elements:', JSON.stringify(allSelects))
  }

  console.log('[HAC CLIENT] Grade periods found:', availablePeriods, 'current:', currentPeriod, 'dropdown:', periodDropdownName)

  // ── Step 3: Switch period via ASP.NET postback if requested ───────────────
  if (period && availablePeriods.length > 0 && availablePeriods.includes(period) && period !== currentPeriod) {
    // Use the value map built during option parsing (e.g., "1" → "1-2026" for Katy ISD)
    const periodValue = periodValueMap[period] ?? period
    // Katy ISD HAC uses a "Refresh View" button for full-page postback — NOT a dropdown onChange event.
    // We must POST with btnRefreshView as the event target and include the desired period as the select value.
    const dropdownName = periodDropdownName || 'ctl00$plnMain$ddlReportCardRuns'
    const viewState       = ($content('[id="__VIEWSTATE"]').val() as string) ?? ''
    const eventValidation = ($content('[id="__EVENTVALIDATION"]').val() as string) ?? ''
    const vsGenerator     = ($content('[id="__VIEWSTATEGENERATOR"]').val() as string) ?? ''

    console.log('[HAC CLIENT] Switching grade period:', { period, periodValue, dropdownName, viewStateLen: viewState.length })

    const formData = new URLSearchParams({
      __EVENTTARGET: 'ctl00$plnMain$btnRefreshView',
      __EVENTARGUMENT: '',
      __VIEWSTATE: viewState,
      __EVENTVALIDATION: eventValidation,
      __VIEWSTATEGENERATOR: vsGenerator,
      [dropdownName]: periodValue,
    })
    await sleep(500 + Math.random() * 300)
    const postRes = await http.post(contentUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: contentUrl,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    contentHtml = postRes.data as string
    console.log('[HAC CLIENT] Period switch response len:', contentHtml.length, 'isHtml:', contentHtml.trim().startsWith('<'))
    $content = cheerio.load(contentHtml)
    currentPeriod = period
  }

  const $final = cheerio.load(contentHtml)

  dumpDebugHtml('classwork', contentHtml)

  // Log page structure to understand the HTML
  console.log('[HAC CLIENT] Classwork page structure check:', {
    hasAssignmentClass: $final('.AssignmentClass').length,
    hasSgHeader: $final('.sg-header').length,
    hasClassBlock: $final('[class*="classBlock"]').length,
    hasAssignmentGrid: $final('[id*="AssignmentGrid"]').length,
    hasRptAssig: $final('[id*="rptAssig"]').length,
    hasClassGrade: $final('[class*="ClassGrade"]').length,
    tableCount: $final('table').length,
    divCount: $final('div[class]').length,
  })

  const classes: HACClass[] = []

  // Strategy 1: Standard PowerSchool HAC selectors (.AssignmentClass blocks)
  if ($final('.AssignmentClass').length > 0) {
    console.log('[HAC CLIENT] Using Strategy 1: .AssignmentClass')
    $final('.AssignmentClass').each((_i, el) => {
      classes.push(parseClassBlock($final, $final(el)))
    })
  }

  // Strategy 2: Repeater pattern used by newer HAC instances
  else if ($final('[id*="rptAssigClasses"]').length > 0 || $final('[id*="plnMain_rptAssig"]').length > 0) {
    console.log('[HAC CLIENT] Using Strategy 2: rptAssigClasses pattern')
    $final('[id*="rptAssigClasses"] > div, [id*="plnMain_rptAssig"] > div').each((_i, el) => {
      classes.push(parseClassBlock($final, $final(el)))
    })
  }

  // Strategy 3: Look for class heading + table pairs anywhere on the page
  else {
    console.log('[HAC CLIENT] Using Strategy 3: generic heading + table scan')
    $final('a[id*="lnkCourse"], span[id*="lblHeading"], h3[class*="course"], .sg-header-heading').each((_i, heading) => {
      const $heading = $final(heading)
      const name = $heading.text().replace(/\s*[-–]\s*Period\s*\d+.*$/i, '').trim()
      if (!name) return

      const $table = $heading.closest('div, td').find('table').first()
      if ($table.length === 0) return

      const average = $heading.closest('div, td').find('[id*="lblAverage"], .sg-header-average').text()
        .replace(/Student\s*Avg[:.]\s*/i, '').trim() || null

      const scores: HACScore[] = []
      $table.find('tr').each((_j, row) => {
        const cells = $final(row).find('td')
        if (cells.length < 2) return
        const aName = cells.eq(0).text().trim()
        if (!aName || aName.toLowerCase() === 'assignment') return
        scores.push({
          name: aName,
          category: cells.eq(1).text().trim() || 'Uncategorized',
          score: parseFloat(cells.eq(2).text()) || null,
          totalPoints: parseFloat(cells.eq(3).text()) || null,
          percentage: cells.eq(4).text().trim() || '',
          dateDue: cells.eq(5).text().trim() || '',
        })
      })

      classes.push({ name, period: '', teacher: '', room: '', average, scores })
    })
  }

  console.log('[HAC CLIENT] Parsed', classes.length, 'classes from classwork page')
  return { classes, availablePeriods, currentPeriod }
}

// Helper: parse a single class block element into a HACClass
function parseClassBlock(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<AnyNode>
): HACClass {
  // Course name — prefer heading NOT marked .sg-right (which is the average side)
  const rawName = $el.find('.sg-header .sg-header-heading:not(.sg-right), .sg-header-heading:not(.sg-right), [id*="lblHeading"], h3, .course-title, a[id*="lnkCourse"]').first().text().trim()
  const name = rawName
    .replace(/\s*[-–]\s*Period\s*\d+.*$/i, '')
    .replace(/\s*[-–]\s*Pd\.?\s*\d+.*$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim() || rawName

  // Period
  const periodText = $el.find('.sg-header-period, [id*="lblPeriod"]').text().replace(/Period/i, '').trim()

  // Average — gradexis: the right-aligned heading holds the average as last word
  const sgRightText = $el.find('.sg-header .sg-header-heading.sg-right').text().trim()
  const sgRightVal  = sgRightText ? sgRightText.split(' ').pop()?.replace('%', '').trim() : undefined
  const avgFromRight = (sgRightVal && sgRightVal !== '--' && sgRightVal !== 'N/A' && !isNaN(parseFloat(sgRightVal)))
    ? sgRightVal : undefined
  const avgRaw = avgFromRight
    ?? $el.find('.sg-header-average, [id*="lblAverage"], [id*="lblHdrAverage"]').text()
        .replace(/Student\s*Avg[:.]\s*/i, '')
        .replace(/Classwork\s*Average\s*/i, '')
        .trim()
  const average = avgRaw && avgRaw !== '--' && avgRaw !== 'N/A' ? avgRaw : null

  // Teacher
  const teacher = $el.find('.sg-header-teacher, [id*="lblTeacher"]').text().trim()

  // Determine column positions dynamically from header row
  const colHeaders: string[] = []
  $el.find('tr.sg-asp-table-header-row th, thead th, tr:first-child th').each((_i, th) => {
    colHeaders.push($(th).text().trim().toLowerCase())
  })

  const colIdx = (keywords: string[]): number => {
    for (const kw of keywords) {
      const idx = colHeaders.findIndex(h => h.includes(kw))
      if (idx !== -1) return idx
    }
    return -1
  }

  const nameIdx  = colIdx(['assignment', 'name', 'description'])
  const dateIdx  = colIdx(['due', 'date'])
  const catIdx   = colIdx(['category', 'type'])
  const scoreIdx = colIdx(['score', 'earned', 'points earned'])
  const totalIdx = colIdx(['total', 'out of', 'possible', 'max'])
  const pctIdx   = colIdx(['%', 'percent'])

  const scores: HACScore[] = []

  $el.find('.sg-content-grid > .sg-asp-table > tbody > .sg-asp-table-data-row, tr.sg-asp-table-data-row, tbody tr').each((_j, row) => {
    const cells = $(row).find('td')
    if (cells.length < 2) return

    // Gradexis column order: 0=dateDue, 1=dateAssigned, 2=name, 3=category, 4=score, 5=totalPoints, 9=percentage
    const aName    = nameIdx  >= 0 ? cells.eq(nameIdx).text().trim()  : cells.eq(2).children().first().text().trim() || cells.eq(2).text().trim()
    const dateDue  = dateIdx  >= 0 ? cells.eq(dateIdx).text().trim()  : cells.eq(0).text().trim()
    const category = catIdx   >= 0 ? cells.eq(catIdx).text().trim()   : cells.eq(3).text().trim()
    const scoreRaw = scoreIdx >= 0 ? cells.eq(scoreIdx).text().trim() : cells.eq(4).text().trim()
    const totalRaw = totalIdx >= 0 ? cells.eq(totalIdx).text().trim() : cells.eq(5).text().trim()
    const pctRaw   = pctIdx   >= 0 ? cells.eq(pctIdx).text().trim()  : cells.eq(9).text().trim() || cells.eq(6).text().trim()

    if (!aName || aName.toLowerCase().includes('no assignment')) return

    scores.push({
      name: aName,
      category: category || 'Uncategorized',
      score: scoreRaw && scoreRaw !== '--' ? parseFloat(scoreRaw) || null : null,
      totalPoints: totalRaw && totalRaw !== '--' ? parseFloat(totalRaw) || null : null,
      percentage: pctRaw,
      dateDue,
    })
  })

  return { name, period: periodText, teacher, room: '', average, scores }
}

export async function getTranscript(sessionToken: string): Promise<HACTranscript> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const origin = stored.baseUrl

  await sleep(800 + Math.random() * 400) // 0.8–1.2s delay
  const transcriptUrl = `${origin}HomeAccess/Grades/Transcript`
  const res = await http.get(transcriptUrl, {
    headers: { Referer: `${origin}HomeAccess/Home.aspx` },
  })
  const outerTransHtml = res.data as string
  const $outerTrans = cheerio.load(outerTransHtml)
  let transcriptHtml = outerTransHtml

  const transiframeSrc = $outerTrans('iframe.sg-legacy-iframe, iframe[id*="legacy"], iframe[src*="Transcript"]').attr('src')
  if (transiframeSrc && $outerTrans('table').length === 0) {
    const transIframeUrl = transiframeSrc.startsWith('http') ? transiframeSrc : new URL(transiframeSrc, transcriptUrl).toString()
    console.log('[TRANSCRIPT] Shell page — fetching iframe:', transIframeUrl)
    try {
      await sleep(400 + Math.random() * 300)
      const iframeRes = await http.get(transIframeUrl, { headers: { Referer: transcriptUrl } })
      if (typeof iframeRes.data === 'string' && iframeRes.data.length > 500) transcriptHtml = iframeRes.data
    } catch (e) { console.warn('[TRANSCRIPT] iframe fetch failed:', e instanceof Error ? e.message : String(e)) }
  }

  dumpDebugHtml('transcript', transcriptHtml)
  const $ = cheerio.load(transcriptHtml)

  const semesters: HACTranscriptEntry[] = []

  // Strategy 1: gradexis — container is a <td> element with class sg-transcript-group
  $('td.sg-transcript-group').each((_i, group) => {
    const $group = $(group)
    let year = ''
    let semester = ''

    $group.find('span').each((_j, span) => {
      const id = $(span).attr('id') ?? ''
      if (id.includes('YearValue')) year = $(span).text().trim()
      if (id.includes('GroupValue')) semester = $(span).text().trim()
    })

    if (!year || !semester) {
      const header = $group.find('.sg-transcript-group-heading, [id*="lblHeading"], th').first().text().trim()
      const yearMatch = header.match(/(\d{4})/g)
      const semMatch  = header.match(/Semester\s*(\d)/i) || header.match(/(1st|2nd|First|Second)/i)
      if (!year && yearMatch) year = yearMatch[yearMatch.length - 1]
      if (!semester && semMatch) semester = semMatch[1] ?? String(_i + 1)
    }

    const courses: Array<{ name: string; grade: string; credits: string }> = []

    $group.find('table:nth-child(2) > tbody > tr.sg-asp-table-data-row, tr.sg-asp-table-data-row').each((_j, row) => {
      const cells = $(row).find('td')
      if (cells.length < 2) return
      const courseCode = cells.eq(0).text().trim()
      const courseDesc = cells.eq(1).text().trim()
      if (!courseCode || !courseDesc || /^(course|class|subject)/i.test(courseCode)) return
      courses.push({
        name: `${courseCode} — ${courseDesc}`,
        grade: cells.eq(2).text().trim(),
        credits: cells.eq(3).text().trim(),
      })
    })

    if (courses.length > 0) {
      semesters.push({ year, semester: semester || String(_i + 1), courses })
    }
  })

  // Strategy 2: broader selectors fallback
  if (semesters.length === 0) {
    $('.sg-transcript-group, [id*="TranscriptGroup"], [id*="rptGroup"] > td').each((_i, group) => {
      const header = $(group).find('.sg-transcript-group-heading, [id*="lblHeading"]').text().trim()
        || $(group).find('th').first().text().trim()

      const yearMatch = header.match(/(\d{4})/g)
      const semMatch  = header.match(/Semester\s*(\d)/i) || header.match(/(1st|2nd|First|Second)/i)

      const courses: Array<{ name: string; grade: string; credits: string }> = []

      $(group).find('tr').each((_j, row) => {
        const cells = $(row).find('td')
        if (cells.length < 2) return
        const courseName = cells.eq(0).text().trim()
        if (!courseName || courseName.toLowerCase().includes('course')) return
        courses.push({
          name: courseName,
          grade: cells.eq(1).text().trim(),
          credits: cells.eq(2).text().trim(),
        })
      })

      if (courses.length > 0) {
        semesters.push({
          year: yearMatch ? yearMatch[yearMatch.length - 1] : '',
          semester: semMatch ? semMatch[1] : String(_i + 1),
          courses,
        })
      }
    })
  }

  // Fallback: if no group selectors matched, scan all tables for course data
  if (semesters.length === 0) {
    console.warn('[TRANSCRIPT] No groups found with standard selectors — trying generic table scan')
    $('table').each((_tIdx, table) => {
      const rows = $(table).find('tr')
      if (rows.length < 2) return
      const courses: Array<{ name: string; grade: string; credits: string }> = []
      rows.each((_j, row) => {
        const cells = $(row).find('td')
        if (cells.length < 2) return
        const name = cells.eq(0).text().trim()
        if (!name || /^(course|class|subject|total|gpa|grade)/i.test(name) || name.length < 4) return
        courses.push({
          name,
          grade: cells.eq(1).text().trim(),
          credits: cells.eq(2).text().trim() || '0.5',
        })
      })
      if (courses.length > 0) {
        semesters.push({ year: `Table ${_tIdx + 1}`, semester: String(_tIdx + 1), courses })
      }
    })
  }

  // Multi-strategy GPA extraction
  let cumulativeGPA: string | null = null

  // Strategy 1: direct element selectors
  const gpaSelectors = [
    '[id*="GPACum"]', '[id*="CumGPA"]', '[id*="lblCumGPA"]', '[id*="CumulativeGPA"]',
    '[id*="lblGPA"]', '.sg-transcript-gpa', 'span[id$="GPA"]',
  ]
  for (const sel of gpaSelectors) {
    const text = $(sel).text().trim()
    const match = text.match(/([\d]+\.[\d]+)/)
    if (match) {
      cumulativeGPA = match[1]
      console.log(`[TRANSCRIPT] GPA found via selector "${sel}": ${cumulativeGPA}`)
      break
    }
  }

  // Strategy 2: body text regex scan
  if (!cumulativeGPA) {
    const bodyText = $('body').text()
    const patterns = [
      /Cumulative\s+GPA[:\s]+([\d]+\.[\d]+)/i,
      /Cum(?:ulative)?\s+GPA[:\s]+([\d]+\.[\d]+)/i,
      /GPA[:\s]+([\d]+\.[\d]+)/i,
      /Grade\s+Point\s+Average[:\s]+([\d]+\.[\d]+)/i,
    ]
    for (const pattern of patterns) {
      const match = bodyText.match(pattern)
      if (match) {
        cumulativeGPA = match[1]
        console.log(`[TRANSCRIPT] GPA found via text scan: ${cumulativeGPA}`)
        break
      }
    }
  }

  // Strategy 3: table cell scan for GPA-adjacent float
  if (!cumulativeGPA) {
    $('td, th').each((_i, el) => {
      const text = $(el).text().trim()
      if (text.match(/^[0-4]\.\d{1,4}$/) && parseFloat(text) > 0) {
        const prev = $(el).prev().text().toLowerCase()
        const prevRow = $(el).closest('tr').prev().text().toLowerCase()
        if (prev.includes('gpa') || prevRow.includes('gpa') || prev.includes('average')) {
          cumulativeGPA = text
          console.log(`[TRANSCRIPT] GPA found via table scan: ${cumulativeGPA}`)
          return false
        }
      }
    })
  }

  if (!cumulativeGPA) {
    console.warn('[TRANSCRIPT] Could not extract GPA — table previews:')
    $('table').each((_i, table) => {
      console.warn('[TRANSCRIPT TABLE]', $(table).text().replace(/\s+/g, ' ').trim().substring(0, 200))
    })
  }

  // ── Extract weighted GPA, unweighted GPA, class rank, and quartile ──────
  // These are in the tblCumGPAInfo table at the bottom of the transcript page.
  // Structure: rows labeled "Weighted GPA*" and "Unweighted GPA*" with columns: GPA Type, GPA, Rank, Quartile

  let weightedGPA: string | null = null
  let unweightedGPA: string | null = null
  let classRank: string | null = null
  let quartile: string | null = null

  // Strategy 1: specific ID selectors from the GPA summary table
  const weightedSelectors = [
    '[id*="lblGPACum3"]',
    '[id*="lblGPACum"][id*="3"]',
  ]
  const unweightedSelectors = [
    '[id*="lblGPACum4"]',
    '[id*="lblGPACum"][id*="4"]',
  ]
  const rankSelectors = [
    '[id*="lblGPARank3"]',
    '[id*="lblGPARank"]:not(:empty)',
  ]
  const quartileSelectors = [
    '[id*="Quartile3"]',
    '[id*="Quartile"]:not(:empty)',
  ]

  for (const sel of weightedSelectors) {
    const text = $(sel).text().trim()
    if (text && text.match(/^\d/)) {
      weightedGPA = text
      console.log(`[TRANSCRIPT] Weighted GPA found via "${sel}": ${weightedGPA}`)
      break
    }
  }

  for (const sel of unweightedSelectors) {
    const text = $(sel).text().trim()
    if (text && text.match(/^\d/)) {
      unweightedGPA = text
      console.log(`[TRANSCRIPT] Unweighted GPA found via "${sel}": ${unweightedGPA}`)
      break
    }
  }

  for (const sel of rankSelectors) {
    const text = $(sel).text().trim()
    if (text && text.match(/\d/)) {
      classRank = text
      console.log(`[TRANSCRIPT] Class rank found via "${sel}": ${classRank}`)
      break
    }
  }

  for (const sel of quartileSelectors) {
    const text = $(sel).text().trim()
    if (text && text.match(/\d/)) {
      quartile = text
      console.log(`[TRANSCRIPT] Quartile found via "${sel}": ${quartile}`)
      break
    }
  }

  // Strategy 2: scan the GPA summary table rows for Weighted/Unweighted labels
  if (!weightedGPA || !unweightedGPA || !classRank || !quartile) {
    const gpaTable = $('[id*="tblCumGPAInfo"], [id*="CumGPAInfo"]').first()
    if (gpaTable.length > 0) {
      console.log('[TRANSCRIPT] Found GPA summary table — scanning rows')
      gpaTable.find('tr').each((_i, row) => {
        const cells = $(row).find('td')
        if (cells.length < 2) return
        const label = cells.eq(0).text().trim().toLowerCase()
        if (label.includes('weighted') && !label.includes('unweight')) {
          if (!weightedGPA) weightedGPA = cells.eq(1).text().trim() || null
          if (!classRank) classRank = cells.eq(2).text().trim() || null
          if (!quartile) quartile = cells.eq(3).text().trim() || null
          console.log(`[TRANSCRIPT] Weighted row: GPA=${weightedGPA}, Rank=${classRank}, Quartile=${quartile}`)
        } else if (label.includes('unweighted')) {
          if (!unweightedGPA) unweightedGPA = cells.eq(1).text().trim() || null
          // Unweighted row may also have rank/quartile if weighted is empty
          if (!classRank && cells.eq(2).text().trim()) classRank = cells.eq(2).text().trim() || null
          if (!quartile && cells.eq(3).text().trim()) quartile = cells.eq(3).text().trim() || null
          console.log(`[TRANSCRIPT] Unweighted row: GPA=${unweightedGPA}`)
        }
      })
    }
  }

  // Strategy 3: ensure quartile is just a bare number 1-4
  if (quartile) {
    const cleanQ = quartile.replace(/[^\d]/g, '').trim()
    const qNum = parseInt(cleanQ, 10)
    if (qNum >= 1 && qNum <= 4) {
      quartile = String(qNum)
    } else {
      console.warn(`[TRANSCRIPT] Discarded invalid quartile value: "${quartile}" — will calculate from rank`)
      quartile = null
    }
  }

  // Strategy 4: if quartile is missing but classRank is available (e.g. "445 / 996"),
  // calculate quartile from rank position.
  if (!quartile && classRank) {
    const rankMatch = classRank.match(/(\d+)\s*\/\s*(\d+)/)
    if (rankMatch) {
      const position = parseInt(rankMatch[1], 10)
      const total = parseInt(rankMatch[2], 10)
      if (!isNaN(position) && !isNaN(total) && total > 0) {
        const ratio = position / total
        // Quartile 1 = top 25% (0–0.25), Q2 = 0.25–0.5, Q3 = 0.5–0.75, Q4 = 0.75–1.0
        if (ratio <= 0.25) quartile = '1'
        else if (ratio <= 0.5) quartile = '2'
        else if (ratio <= 0.75) quartile = '3'
        else quartile = '4'
        console.log(`[TRANSCRIPT] Quartile calculated from rank "${classRank}": Q${quartile} (ratio=${ratio.toFixed(3)})`)
      }
    }
  }

  // Strategy 3 (renamed): text pattern scan for weighted/unweighted GPA
  if (!weightedGPA || !unweightedGPA) {
    const bodyText = $('body').text()
    if (!weightedGPA) {
      const wMatch = bodyText.match(/Weighted\s+GPA\*?\s*[:\s]*([\d]+\.[\d]+)/i)
      if (wMatch) {
        weightedGPA = wMatch[1]
        console.log(`[TRANSCRIPT] Weighted GPA found via text scan: ${weightedGPA}`)
      }
    }
    if (!unweightedGPA) {
      const uMatch = bodyText.match(/Unweighted\s+GPA\*?\s*[:\s]*([\d]+\.[\d]+)/i)
      if (uMatch) {
        unweightedGPA = uMatch[1]
        console.log(`[TRANSCRIPT] Unweighted GPA found via text scan: ${unweightedGPA}`)
      }
    }
  }

  console.log('[TRANSCRIPT] Final GPA summary:', {
    cumulativeGPA,
    weightedGPA,
    unweightedGPA,
    classRank,
    quartile,
  })

  return {
    semesters,
    cumulativeGPA,
    weightedGPA,
    unweightedGPA,
    classRank,
    quartile,
  }
}

export async function getSchedule(sessionToken: string): Promise<object[]> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const origin = stored.baseUrl

  await sleep(800 + Math.random() * 400)
  const scheduleUrl = `${origin}HomeAccess/Classes/Schedule`
  const res = await http.get(scheduleUrl, {
    headers: { Referer: `${origin}HomeAccess/Home.aspx` },
  })

  const outerSchedHtml = res.data as string
  const $outerSched = cheerio.load(outerSchedHtml)
  let html = outerSchedHtml

  const schediframeSrc = $outerSched('iframe.sg-legacy-iframe, iframe[id*="legacy"], iframe[src*="Schedule"]').attr('src')
  if (schediframeSrc && $outerSched('table').length === 0) {
    const schedIframeUrl = schediframeSrc.startsWith('http') ? schediframeSrc : new URL(schediframeSrc, scheduleUrl).toString()
    console.log('[SCHEDULE] Shell page — fetching iframe:', schedIframeUrl)
    try {
      await sleep(400 + Math.random() * 300)
      const iframeRes = await http.get(schedIframeUrl, { headers: { Referer: scheduleUrl } })
      if (typeof iframeRes.data === 'string' && iframeRes.data.length > 500) html = iframeRes.data
    } catch (e) { console.warn('[SCHEDULE] iframe fetch failed:', e instanceof Error ? e.message : String(e)) }
  }

  dumpDebugHtml('schedule', html)
  const $ = cheerio.load(html)

  const headers: string[] = []

  // Strategy 1: standard sg-asp-table headers
  $('tr.sg-asp-table-header-row th').each((_i, th) => {
    headers.push($(th).text().trim())
  })

  // Strategy 2: generic thead/th if no sg-asp headers
  if (headers.length === 0) {
    $('thead th, table:first th').each((_i, th) => {
      const t = $(th).text().trim()
      if (t) headers.push(t)
    })
  }

  const schedule: object[] = []

  // Strategy 1: gradexis fixed column positions — courseCode(0), courseName link(1), period(2), teacher(3), room(4)
  $('tr.sg-asp-table-data-row').each((_i, row) => {
    const $row = $(row)
    const children = $row.children()
    const code    = children.first().text().trim()
    const name    = children.eq(1).find('a').text().trim() || children.eq(1).text().trim()
    const period  = children.eq(2).text().trim().substring(0, 1)
    const teacher = children.eq(3).text().trim()
    const room    = children.eq(4).text().trim()

    if (name || code) {
      const entry: Record<string, string> = { courseCode: code, courseName: name, period, teacher, room }
      headers.forEach((h, j) => {
        const cell = $row.find('td').eq(j)
        if (h && !(h in entry)) entry[h] = cell.text().trim()
      })
      schedule.push(entry)
    }
  })

  // Strategy 2: generic tbody rows when sg-asp rows not found
  if (schedule.length === 0 && headers.length > 0) {
    $('tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 2) return
      const entry: Record<string, string> = {}
      cells.each((j, td) => {
        if (headers[j]) entry[headers[j]] = $(td).text().trim()
      })
      if (Object.keys(entry).length > 0) schedule.push(entry)
    })
  }

  // Strategy 3: no headers found — infer from first row
  if (schedule.length === 0) {
    $('table').each((_tIdx, table) => {
      const rows = $(table).find('tr')
      if (rows.length < 2) return
      const hdrs: string[] = []
      rows.first().find('th, td').each((_j, cell) => {
        hdrs.push($(cell).text().trim() || `Col${_j + 1}`)
      })
      rows.slice(1).each((_j, row) => {
        const cells = $(row).find('td')
        if (cells.length < 2) return
        const entry: Record<string, string> = {}
        cells.each((k, td) => { if (hdrs[k]) entry[hdrs[k]] = $(td).text().trim() })
        if (Object.keys(entry).length > 0) schedule.push(entry)
      })
      if (schedule.length > 0) return false
    })
  }

  console.log(`[SCHEDULE] Parsed ${schedule.length} rows`)
  if (schedule.length === 0) console.warn('[SCHEDULE] No rows found — check debug_schedule.html')
  return schedule
}

function numericToLetter(grade: string): string {
  const n = parseInt(grade)
  if (isNaN(n)) return ''
  if (n >= 90) return 'A'
  if (n >= 80) return 'B'
  if (n >= 70) return 'C'
  if (n >= 60) return 'D'
  return 'F'
}

export async function getReportCard(sessionToken: string, period?: string): Promise<{
  reportingPeriods: string[]
  currentPeriod: string
  semesters: {
    sem1: Array<{ name: string; period: string; numericGrade: string; letterGrade: string; credits: string; teacher: string }>
    sem2: Array<{ name: string; period: string; numericGrade: string; letterGrade: string; credits: string; teacher: string }>
  }
}> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired — please log in again')

  const { http } = restoreSession(stored)
  const origin = stored.baseUrl

  await sleep(800 + Math.random() * 400)
  const reportCardUrl = `${origin}HomeAccess/Grades/ReportCard`
  const initialRes = await http.get(reportCardUrl, {
    headers: { Referer: `${origin}HomeAccess/Home.aspx` },
  })

  const outerRCHtml = initialRes.data as string
  const $outerRC = cheerio.load(outerRCHtml)
  let html = outerRCHtml
  let rcContentUrl = reportCardUrl

  const rciframeSrc = $outerRC('iframe.sg-legacy-iframe, iframe[id*="legacy"], iframe[src*="ReportCard"]').attr('src')
  if (rciframeSrc && $outerRC('table').length === 0) {
    rcContentUrl = rciframeSrc.startsWith('http') ? rciframeSrc : new URL(rciframeSrc, reportCardUrl).toString()
    console.log('[REPORT CARD] Shell page — fetching iframe:', rcContentUrl)
    try {
      await sleep(400 + Math.random() * 300)
      const iframeRes = await http.get(rcContentUrl, { headers: { Referer: reportCardUrl } })
      if (typeof iframeRes.data === 'string' && iframeRes.data.length > 500) html = iframeRes.data
    } catch (e) { console.warn('[REPORT CARD] iframe fetch failed:', e instanceof Error ? e.message : String(e)) }
  }

  let $ = cheerio.load(html)

  // Extract reporting period dropdown options
  const reportingPeriods: string[] = []
  let currentPeriod = ''
  $('[id*="ddlRCRuns"] option, #plnMain_ddlRCRuns option, [id*="ddlReportCardRuns"] option').each((_i, opt) => {
    const text = $(opt).text().trim()
    if (text) {
      reportingPeriods.push(text)
      if ($(opt).attr('selected') || !currentPeriod) currentPeriod = text
    }
  })

  // If a specific period is requested, POST back to HAC selecting it
  if (period && period !== currentPeriod && reportingPeriods.includes(period)) {
    let requestedValue = ''
    $('[id*="ddlRCRuns"] option, #plnMain_ddlRCRuns option, [id*="ddlReportCardRuns"] option').each((_i, opt) => {
      if ($(opt).text().trim() === period) { requestedValue = $(opt).attr('value') ?? ''; return false }
    })
    const dropdownName = $('[id*="ddlRCRuns"], [id*="ddlReportCardRuns"]').first().attr('name') ?? 'ctl00$plnMain$ddlRCRuns'
    const formData = new URLSearchParams({
      __EVENTTARGET: dropdownName,
      __EVENTARGUMENT: '',
      __VIEWSTATE: ($('[id="__VIEWSTATE"]').val() as string) ?? '',
      __EVENTVALIDATION: ($('[id="__EVENTVALIDATION"]').val() as string) ?? '',
      __VIEWSTATEGENERATOR: ($('[id="__VIEWSTATEGENERATOR"]').val() as string) ?? '',
      [dropdownName]: requestedValue,
    })
    const postRes = await http.post(rcContentUrl, formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: rcContentUrl },
    })
    html = postRes.data as string
    $ = cheerio.load(html)
    currentPeriod = period
  }

  dumpDebugHtml('reportcard', html)

  type RCCourse = { name: string; period: string; numericGrade: string; letterGrade: string; credits: string; teacher: string }
  const sem1: RCCourse[] = []
  const sem2: RCCourse[] = []

  const rowSelectors = [
    '.sg-asp-table-data-row',
    'table.sg-asp-table tr',
    '[id*="ReportCard"] tr',
    '[id*="dgReport"] tr',
    'table tr',
  ]

  // HAC dgReportCard columns:
  // 0: Course  1: Description  2: Period  3: Teacher  4: Room
  // 5: Att.Credit  6: Ern.Credit
  // 7: 1ST  8: 2ND  9: 3RD  10: EXM1  11: SEM1
  // 12: 4TH  13: 5TH  14: 6TH  15: EXM2  16: SEM2
  for (const sel of rowSelectors) {
    const rows = $(sel)
    if (rows.length < 2) continue
    rows.each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 4) return
      const courseCode = cells.eq(0).text().trim()
      const description = cells.eq(1).text().trim().replace(/\s+/g, ' ')
      if (!courseCode || /^(course|class|subject|period|name)/i.test(courseCode)) return
      const name    = `${courseCode} — ${description}`
      const prd     = cells.eq(2).text().trim()
      const teacher = cells.eq(3).text().trim()

      const sem1Grade = cells.length > 11 ? cells.eq(11).text().trim() : ''
      const sem2Grade = cells.length > 16 ? cells.eq(16).text().trim() : ''

      if (sem1Grade) {
        sem1.push({ name, period: prd, numericGrade: sem1Grade, letterGrade: numericToLetter(sem1Grade), credits: '', teacher })
      }
      if (sem2Grade) {
        sem2.push({ name, period: prd, numericGrade: sem2Grade, letterGrade: numericToLetter(sem2Grade), credits: '', teacher })
      }
      // If neither grade is populated yet (mid-year), still include the row in sem1 as a placeholder
      if (!sem1Grade && !sem2Grade) {
        sem1.push({ name, period: prd, numericGrade: '', letterGrade: '', credits: '', teacher })
      }
    })
    if (sem1.length > 0 || sem2.length > 0) break
  }

  console.log(`[REPORT CARD] Parsed sem1=${sem1.length} sem2=${sem2.length} courses, ${reportingPeriods.length} periods`)
  if (sem1.length === 0) console.warn('[REPORT CARD] No courses found — check debug_reportcard.html')
  return { reportingPeriods, currentPeriod, semesters: { sem1, sem2 } }
}

export async function getProgressReport(sessionToken: string, date?: string): Promise<{
  availableDates: string[]
  currentDate: string
  courses: Array<{ name: string; period: string; average: string; letterGrade: string; teacher: string }>
}> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired — please log in again')

  const { http } = restoreSession(stored)
  const origin = stored.baseUrl

  await sleep(800 + Math.random() * 400)
  const iprUrl = `${origin}HomeAccess/Grades/IPR`
  const initialRes = await http.get(iprUrl, {
    headers: { Referer: `${origin}HomeAccess/Home.aspx` },
  })

  const outerIPRHtml = initialRes.data as string
  const $outerIPR = cheerio.load(outerIPRHtml)
  let html = outerIPRHtml
  let iprContentUrl = iprUrl

  const ipriframeSrc = $outerIPR('iframe.sg-legacy-iframe, iframe[id*="legacy"], iframe[src*="IPR"], iframe[src*="Progress"]').attr('src')
  if (ipriframeSrc && $outerIPR('table').length === 0) {
    iprContentUrl = ipriframeSrc.startsWith('http') ? ipriframeSrc : new URL(ipriframeSrc, iprUrl).toString()
    console.log('[IPR] Shell page — fetching iframe:', iprContentUrl)
    try {
      await sleep(400 + Math.random() * 300)
      const iframeRes = await http.get(iprContentUrl, { headers: { Referer: iprUrl } })
      if (typeof iframeRes.data === 'string' && iframeRes.data.length > 500) html = iframeRes.data
    } catch (e) { console.warn('[IPR] iframe fetch failed:', e instanceof Error ? e.message : String(e)) }
  }

  let $ = cheerio.load(html)

  // Extract IPR date dropdown options (#plnMain_ddlIPRDates)
  const availableDates: string[] = []
  let currentDate = ''
  $('[id*="ddlIPRDates"] option, #plnMain_ddlIPRDates option').each((_i, opt) => {
    const text = $(opt).text().trim()
    if (text) {
      availableDates.push(text)
      if ($(opt).attr('selected') || !currentDate) currentDate = text
    }
  })

  // If a specific date is requested, POST back to HAC selecting it
  if (date && date !== currentDate && availableDates.includes(date)) {
    let requestedValue = ''
    $('[id*="ddlIPRDates"] option, #plnMain_ddlIPRDates option').each((_i, opt) => {
      if ($(opt).text().trim() === date) { requestedValue = $(opt).attr('value') ?? ''; return false }
    })
    const dropdownName = $('[id*="ddlIPRDates"]').attr('name') ?? 'ctl00$plnMain$ddlIPRDates'
    const formData = new URLSearchParams({
      __EVENTTARGET: dropdownName,
      __EVENTARGUMENT: '',
      __VIEWSTATE: ($('[id="__VIEWSTATE"]').val() as string) ?? '',
      __EVENTVALIDATION: ($('[id="__EVENTVALIDATION"]').val() as string) ?? '',
      __VIEWSTATEGENERATOR: ($('[id="__VIEWSTATEGENERATOR"]').val() as string) ?? '',
      [dropdownName]: requestedValue,
    })
    const postRes = await http.post(iprContentUrl, formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: iprContentUrl },
    })
    html = postRes.data as string
    $ = cheerio.load(html)
    currentDate = date
  }

  dumpDebugHtml('ipr', html)

  const courses: Array<{ name: string; period: string; average: string; letterGrade: string; teacher: string }> = []

  // Strategy 0: #plnMain_dgIPR rows (cols: 0=course, 1=desc, 2=period, 3=teacher, 4=room, 5=grade)
  const dgIPRRows = $('#plnMain_dgIPR .sg-asp-table-data-row, #plnMain_dgIPR tr.sg-asp-table-data-row')
  if (dgIPRRows.length > 0) {
    dgIPRRows.each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 3) return
      const name = cells.eq(0).text().trim()
      if (!name || /^(course|class)/i.test(name)) return
      courses.push({ name, period: cells.eq(2).text().trim(), average: cells.eq(5).text().trim(), letterGrade: cells.eq(5).text().trim(), teacher: cells.eq(3).text().trim() })
    })
  }

  if (courses.length === 0) {
    $('.sg-asp-table-data-row').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 3) return
      const name = cells.eq(0).text().trim()
      if (!name || /^(course|class)/i.test(name)) return
      courses.push({ name, period: cells.eq(2).text().trim(), average: cells.eq(5).text().trim(), letterGrade: cells.eq(5).text().trim(), teacher: cells.eq(3).text().trim() })
    })
  }

  if (courses.length === 0 && $('.AssignmentClass').length > 0) {
    $('.AssignmentClass').each((_i, el) => {
      const rawName = $(el).find('.sg-header-heading, [id*="lblCourseName"]').first().text().trim()
      const name = rawName.replace(/\s*[-–]\s*Period\s*\d+.*$/i, '').trim() || rawName
      const period = $(el).find('.sg-header-period, [id*="lblPeriod"]').text().replace(/Period/i, '').trim()
      const average = $(el).find('.sg-header-average, [id*="lblAverage"]').text().replace(/Student\s*Avg[:.]\s*/i, '').trim()
      const teacher = $(el).find('.sg-header-teacher, [id*="lblTeacher"]').text().trim()
      if (name) courses.push({ name, period, average, letterGrade: '', teacher })
    })
  }

  if (courses.length === 0) {
    $('table tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 2) return
      const name = cells.eq(0).text().trim()
      if (!name || /^(course|class|subject|teacher)/i.test(name)) return
      courses.push({ name, period: cells.eq(1).text().trim(), average: cells.eq(2).text().trim(), letterGrade: cells.eq(3).text().trim(), teacher: cells.eq(4).text().trim() || '' })
    })
  }

  console.log(`[IPR] Parsed ${courses.length} courses, ${availableDates.length} dates available`)
  if (courses.length === 0) console.warn('[IPR] No courses found — check debug_ipr.html')
  return { availableDates, currentDate, courses }
}

export async function getContactTeachers(sessionToken: string): Promise<{
  teachers: Array<{ name: string; courseName: string; period: string; email: null; emailNote: string; emailHint: string }>
}> {
  const { classes } = await getGrades(sessionToken)

  const teachers = classes
    .filter(c => c.teacher && c.teacher.trim() !== '')
    .map(c => {
      const parts = c.teacher.trim().split(/\s+/)
      const emailHint = parts.length >= 2
        ? `${parts[0].toLowerCase()}.${parts[parts.length - 1].toLowerCase()}@katyisd.org`
        : `${c.teacher.toLowerCase().replace(/\s+/g, '.')}@katyisd.org`
      return {
        name: c.teacher,
        courseName: c.name,
        period: c.period,
        email: null as null,
        emailNote: 'Contact via school directory or Katy ISD staff search',
        emailHint,
      }
    })
    .filter((t, i, arr) => arr.findIndex(x => x.name === t.name) === i)

  return { teachers }
}

export async function getStudentInfo(sessionToken: string): Promise<HACStudentInfo> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const origin = stored.baseUrl

  // The Demographic page is a shell that loads content inside an iframe
  const demoUrl = `${origin}HomeAccess/Registration/Demographic`
  console.log('[HAC CLIENT] Fetching student info from:', demoUrl)

  const res = await http.get(demoUrl, {
    headers: { Referer: `${origin}HomeAccess/Home.aspx` },
  })

  const outerHtml = res.data as string
  const finalUrl = (res.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? demoUrl

  console.log('[HAC CLIENT] Demographic page response', {
    status: res.status,
    finalUrl,
    htmlLength: outerHtml.length,
  })

  // Check if redirected to login (session expired)
  if (finalUrl.includes('Account/LogOn') || finalUrl.includes('Account/Login')) {
    throw new Error('School session expired — please log in again')
  }

  // The actual student data is inside an iframe — resolve and fetch it
  let html = outerHtml
  const $outer = cheerio.load(outerHtml)
  const iframeSrc = $outer('iframe.sg-legacy-iframe, iframe[id*="legacy"], iframe[src*="Registration"], iframe[src*="Student"]').attr('src')
  if (iframeSrc) {
    const iframeUrl = iframeSrc.startsWith('http') ? iframeSrc : new URL(iframeSrc, demoUrl).toString()
    console.log('[HAC CLIENT] Demographic page has iframe — fetching:', iframeUrl)
    try {
      await sleep(400 + Math.random() * 300)
      const iframeRes = await http.get(iframeUrl, { headers: { Referer: demoUrl } })
      if (typeof iframeRes.data === 'string' && iframeRes.data.length > 200) {
        html = iframeRes.data
        console.log('[HAC CLIENT] Iframe content fetched:', { htmlLength: html.length })
      }
    } catch (e) {
      console.warn('[HAC CLIENT] Failed to fetch demographic iframe:', e instanceof Error ? e.message : String(e))
    }
  }

  dumpDebugHtml('demographic', html)

  const $ = cheerio.load(html)

  // Helper: try multiple selectors, return first non-empty result
  function trySelectors(selectors: string[]): string {
    for (const sel of selectors) {
      const text = $(sel).text().trim()
      if (text) {
        console.log(`[HAC CLIENT] Student info found via selector "${sel}": "${text.slice(0, 100)}"`)
        return text
      }
    }
    return ''
  }

  // Helper: try label-value pair patterns (common in HAC demographic pages)
  // Looks for patterns like "Counselor: <span>John Smith</span>" or label + sibling
  function tryLabelValuePatterns(labelText: string, valueSelectors: string[]): string {
    // First try direct selectors
    const direct = trySelectors(valueSelectors)
    if (direct) return direct

    // Then try finding by label text and extracting adjacent value
    const bodyText = $('body').text()
    const patterns = [
      new RegExp(`${labelText}\\s*[:\\-]\\s*([^\\n,]+)`, 'i'),
      new RegExp(`${labelText}\\s+([A-Z][a-z]+ [A-Z][a-z]+)`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = bodyText.match(pattern)
      if (match?.[1]) {
        const value = match[1].trim()
        console.log(`[HAC CLIENT] Student info found via text pattern for "${labelText}": "${value}"`)
        return value
      }
    }

    return ''
  }

  // Try to find label-value pairs in table rows (common HAC layout)
  // E.g., <tr><td>Counselor</td><td><span>...</span></td></tr>
  function tryTableRowPattern(labelKeywords: string[]): string {
    let result = ''
    $('tr, .row, div').each((_i, row) => {
      if (result) return false
      const rowText = $(row).text().toLowerCase()
      if (labelKeywords.some(kw => rowText.includes(kw.toLowerCase()))) {
        // Look for a span or td that contains the value
        const spans = $(row).find('span, td:last-child')
        spans.each((_j, span) => {
          if (result) return false
          const text = $(span).text().trim()
          // Skip if this is just the label itself
          if (text && !labelKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
            result = text
          }
        })
      }
    })
    return result
  }

  // Log all spans with IDs for debugging
  console.log('[HAC CLIENT] All spans with IDs on demographic page:')
  $('span[id]').each((_i, el) => {
    const id = $(el).attr('id') ?? ''
    const text = $(el).text().trim()
    if (text) console.log(`  #${id} = "${text.slice(0, 80)}"`)
  })

  // Log all labels/divs for debugging
  console.log('[HAC CLIENT] All labels and key divs:')
  $('label, dt, .label, th').each((_i, el) => {
    const text = $(el).text().trim()
    if (text && text.length < 50) console.log(`  label: "${text}"`)
  })

  const counselor = tryLabelValuePatterns('counselor', [
    '#plnMain_lblCounselor',
    '[id*="Counselor"]',
    '[id*="counselor"]',
  ]) || tryTableRowPattern(['counselor'])

  const cohortYear = tryLabelValuePatterns('cohort', [
    '#plnMain_lblCohortYear',
    '[id*="CohortYear"]',
    '[id*="Cohort"]',
    '[id*="cohortYear"]',
    '[id*="GraduationYear"]',
    '[id*="graduationYear"]',
  ]) || tryTableRowPattern(['cohort', 'graduation year', 'grad year', 'class of'])

  console.log('[HAC CLIENT] Final student info:', {
    counselor: counselor || '(empty)',
    cohortYear: cohortYear || '(empty)',
  })

  return {
    name: trySelectors([
      '#plnMain_lblRegStudentName',
      '#plnMain_lblStudentName',
      '.sg-banner-student-name',
      '[id*="StudentName"]',
      '[id*="lblName"]',
      '.student-name',
    ]),
    grade: trySelectors([
      '#plnMain_lblGrade',
      '[id*="lblGrade"]',
      '[id*="GradeLevel"]',
    ]),
    school: trySelectors([
      '#plnMain_lblBuildingName',
      '[id*="BuildingName"]',
      '[id*="SchoolName"]',
      '.sg-banner-building',
    ]),
    district: trySelectors([
      'span.sg-banner-text',
      '.sg-banner-district',
      '[id*="District"]',
    ]),
    counselor,
    cohortYear,
  }
}

export async function getAttendance(sessionToken: string, monthOffset: number = 0): Promise<{
  month: string
  year: number
  monthIndex: number
  days: Array<{ date: string; dayOfWeek: string; status: string; code: string; description: string }>
  summary: { absences: number; tardies: number; excused: number }
}> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired — please log in again')

  const { http } = restoreSession(stored)
  const origin = stored.baseUrl

  await sleep(800 + Math.random() * 400)
  const initialRes = await http.get(`${origin}HomeAccess/Attendance/MonthView`, {
    headers: { Referer: `${origin}HomeAccess/Home.aspx` },
  })

  let html = initialRes.data as string
  dumpDebugHtml('attendance', html)

  // Navigate months via ASP.NET postback if offset != 0
  if (monthOffset !== 0) {
    const steps = Math.abs(monthOffset)
    for (let s = 0; s < steps; s++) {
      const $nav = cheerio.load(html)
      const prevId = $nav('[id*="lbPrev"]').attr('id') ?? 'ctl00$plnMain$lbPrev'
      const nextId = $nav('[id*="lbNext"]').attr('id') ?? 'ctl00$plnMain$lbNext'
      const target = (monthOffset < 0 ? prevId : nextId).replace(/#/g, '')
      const formData = new URLSearchParams({
        __EVENTTARGET: target,
        __EVENTARGUMENT: '',
        __VIEWSTATE: ($nav('[id="__VIEWSTATE"]').val() as string) ?? '',
        __EVENTVALIDATION: ($nav('[id="__EVENTVALIDATION"]').val() as string) ?? '',
        __VIEWSTATEGENERATOR: ($nav('[id="__VIEWSTATEGENERATOR"]').val() as string) ?? '',
      })
      const navRes = await http.post(`${origin}HomeAccess/Attendance/MonthView`, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${origin}HomeAccess/Attendance/MonthView` },
      })
      html = navRes.data as string
      await sleep(300)
    }
    dumpDebugHtml('attendance_nav', html)
  }

  const $ = cheerio.load(html)

  // Extract month/year heading
  const heading = $('[id*="lblMonthYear"], [id*="lbMonthYear"], caption, .sg-header-heading, h2').first().text().trim()
  const monthYear = heading || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const MONTH_NAMES_ATT = ['january','february','march','april','may','june','july','august','september','october','november','december']
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  let year = new Date().getFullYear()
  let monthIndex = new Date().getMonth()
  const mymatch = monthYear.match(/(\w+)\s+(\d{4})/)
  if (mymatch) {
    const mIdx = MONTH_NAMES_ATT.indexOf(mymatch[1].toLowerCase())
    if (mIdx >= 0) monthIndex = mIdx
    year = parseInt(mymatch[2])
  }

  const days: Array<{ date: string; dayOfWeek: string; status: string; code: string; description: string }> = []

  $('table td').each((_i, cell) => {
    const $cell = $(cell)
    const cellClass = ($cell.attr('class') ?? '').toLowerCase()
    const title = ($cell.attr('title') ?? '').toLowerCase()

    // Get the first visible number from this cell — that's the day number
    const dayText = $cell.find('[id*="lblDate"], .sg-cal-date, span').first().text().trim()
      || $cell.children('span').first().text().trim()
    const dayNum = parseInt(dayText)
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) return

    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    const d = new Date(year, monthIndex, dayNum)
    const dayOfWeek = DAY_NAMES[d.getDay()] ?? ''

    // Determine attendance code from class names, title attribute, or child image IDs
    let code = ''
    let status = ''
    const childClasses = $cell.find('*').map((_j, el) => ($(el).attr('class') ?? '').toLowerCase()).get().join(' ')
    const allClasses = cellClass + ' ' + childClasses
    const hasImg = (id: string) => $cell.find(`[id*="${id}"]`).length > 0

    if (/absent/i.test(title) || /absent/.test(allClasses) || hasImg('imgAbsent') || hasImg('Absent')) { code = 'A'; status = 'Absent' }
    else if (/tardy/i.test(title) || /tardy/.test(allClasses) || hasImg('imgTardy') || hasImg('Tardy')) { code = 'T'; status = 'Tardy' }
    else if (/excused/i.test(title) || /excused/.test(allClasses) || hasImg('imgExcused') || hasImg('Excused')) { code = 'E'; status = 'Excused' }
    else if (/present/i.test(title) || /present/.test(allClasses)) { code = 'P'; status = 'Present' }

    days.push({ date: dateStr, dayOfWeek, status, code, description: ($cell.attr('title') ?? '') })
  })

  // De-duplicate by date (table can have multiple cells per day in some layouts)
  const seen = new Set<string>()
  const uniqueDays = days.filter(d => { if (seen.has(d.date)) return false; seen.add(d.date); return true })

  const absences = uniqueDays.filter(d => d.code === 'A').length
  const tardies  = uniqueDays.filter(d => d.code === 'T').length
  const excused  = uniqueDays.filter(d => d.code === 'E').length

  console.log(`[ATTENDANCE] ${monthYear}: ${uniqueDays.length} days parsed, A=${absences} T=${tardies} E=${excused}`)
  return { month: monthYear, year, monthIndex, days: uniqueDays, summary: { absences, tardies, excused } }
}