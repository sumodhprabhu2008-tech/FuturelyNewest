# FIX 05 — Harden HAC HTML Scrapers for Multi-District Compatibility

## Priority: MEDIUM-HIGH — Required for grades to actually appear after login works

---

## Context & Root Cause

`backend/src/integrations/grades/hacClient.ts` uses specific CSS class names
to scrape grade data:

- `.AssignmentClass` — the container per course
- `.sg-header .sg-header-heading .sg-header-period` — to get the period number
- `.sg-header .sg-header-heading .sg-header-average` — to get the class average
- `tr.sg-asp-table-data-row` — to get assignment rows
- `#plnMain_lblRegStudentName` etc. — element IDs for student info

These selectors work for the default Skyward HAC theme. However:
1. Period and average are scraped as children of `.sg-header-heading` — in
   many deployments they are siblings, not children. This causes empty period
   and average values.
2. The assignment cell index mapping (cells.eq(0) = name, eq(1) = date,
   eq(3) = category, eq(5) = score, eq(6) = total, eq(7) = percentage) is
   hardcoded based on one observed HAC instance. Other districts have
   different column orders or extra columns.
3. The transcript scraper uses `td.sg-transcript-group` which is not a
   standard selector — some districts use `div.sg-transcript-group`.
4. `getStudentInfo` uses hardcoded ASP.NET control IDs that vary by district.

---

## Files You Must Read Before Editing

```
backend/src/integrations/grades/hacClient.ts
backend/src/integrations/grades/normalizeGrades.ts
```

Read the ENTIRE `hacClient.ts` file. Understand every scraping function:
- `getGrades()`
- `getTranscript()`
- `getSchedule()`
- `getStudentInfo()`

---

## Fix 1 — Robust Period and Average Extraction in `getGrades()`

### Current broken approach:

```typescript
const period = $(el)
  .find('.sg-header .sg-header-heading .sg-header-period')
  .text()
  .replace('Period', '')
  .trim()
const average =
  $(el)
    .find('.sg-header .sg-header-heading .sg-header-average')
    .text()
    .replace('Student Avg:', '')
    .trim() || null
```

### Replacement — try multiple selector strategies:

Replace the period extraction with a multi-strategy fallback:

```typescript
/**
 * Extract period from HAC class header.
 * Tries multiple selector strategies for district compatibility.
 */
function extractPeriod($el: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): string {
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
function extractAverage($el: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): string | null {
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
```

Then in the `.AssignmentClass` loop, replace the period and average
extraction lines:

```typescript
const period = extractPeriod($(el), $)
const average = extractAverage($(el), $)
```

---

## Fix 2 — Robust Assignment Row Parsing

The current cell index mapping is hardcoded and fragile. Replace it with
a header-driven approach.

### Find the headers from the assignment table

Inside the `.AssignmentClass` loop, BEFORE iterating rows, extract headers:

```typescript
// Extract column headers to determine cell positions dynamically
const colHeaders: string[] = []
$(el).find('tr.sg-asp-table-header-row th, thead th').each((_i, th) => {
  colHeaders.push($(th).text().trim().toLowerCase())
})

console.log('[HAC CLIENT] Assignment table headers:', colHeaders)

// Helper to find cell index by header keyword
function colIdx(keywords: string[]): number {
  for (const kw of keywords) {
    const idx = colHeaders.findIndex(h => h.includes(kw))
    if (idx !== -1) return idx
  }
  return -1
}

const nameIdx    = colIdx(['assignment', 'name', 'description', 'title']) 
const dateIdx    = colIdx(['due', 'date'])
const catIdx     = colIdx(['category', 'type'])
const scoreIdx   = colIdx(['score', 'points earned', 'earned'])
const totalIdx   = colIdx(['total', 'out of', 'possible'])
const pctIdx     = colIdx(['%', 'percent', 'average'])
```

Then use these indices in the row loop:

```typescript
$(el).find('tr.sg-asp-table-data-row').each((_j, row) => {
  const cells = $(row).find('td')

  // Fallback to hardcoded indices if header detection failed
  const name      = nameIdx  >= 0 ? cells.eq(nameIdx).text().trim()  : cells.eq(0).text().trim()
  const dateDue   = dateIdx  >= 0 ? cells.eq(dateIdx).text().trim()  : cells.eq(1).text().trim()
  const category  = catIdx   >= 0 ? cells.eq(catIdx).text().trim()   : cells.eq(3).text().trim()
  const scoreRaw  = scoreIdx >= 0 ? cells.eq(scoreIdx).text().trim() : cells.eq(5).text().trim()
  const totalRaw  = totalIdx >= 0 ? cells.eq(totalIdx).text().trim() : cells.eq(6).text().trim()
  const pctRaw    = pctIdx   >= 0 ? cells.eq(pctIdx).text().trim()   : cells.eq(7).text().trim()

  const score = parseFloat(scoreRaw) || null
  const totalPoints = parseFloat(totalRaw) || null

  if (name) {
    scores.push({ name, category, score, totalPoints, percentage: pctRaw, dateDue })
  }
})
```

---

## Fix 3 — Robust Course Name Parsing

The `header.split(' - ')` approach sometimes produces wrong names when course
names contain " - " (e.g., "AP English - Language & Composition - Period 1").

Replace:

```typescript
const parts = header.split(' - ')
const name = parts[0]?.trim() ?? header
```

With:

```typescript
// Remove period indicator from end: "Course Name - Period 1" or "Course Name(1)"
const name = header
  .replace(/\s*[-–]\s*Period\s*\d+.*$/i, '')
  .replace(/\s*[-–]\s*Pd\.?\s*\d+.*$/i, '')
  .replace(/\s*\(\d+\)\s*$/, '')
  .trim() || header.trim()
```

---

## Fix 4 — Robust `getStudentInfo()` with Fallbacks

The current implementation uses specific ASP.NET control IDs.
Add fallback selectors for each field:

```typescript
export async function getStudentInfo(sessionToken: string): Promise<HACStudentInfo> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const link = stored.baseUrl

  const res = await http.get(`${link}HomeAccess/Content/Student/Registration.aspx`)
  const $ = cheerio.load(res.data as string)

  // Helper: try multiple selectors, return first non-empty result
  function trySelectors(selectors: string[]): string {
    for (const sel of selectors) {
      const text = $(sel).text().trim()
      if (text) return text
    }
    return ''
  }

  return {
    name: trySelectors([
      '#plnMain_lblRegStudentName',
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
    counselor: trySelectors([
      '#plnMain_lblCounselor',
      '[id*="Counselor"]',
    ]),
    cohortYear: trySelectors([
      '#plnMain_lblCohortYear',
      '[id*="CohortYear"]',
      '[id*="GraduationYear"]',
    ]),
  }
}
```

---

## Fix 5 — Add a Selector Debug Log

At the top of `getGrades()`, after loading the HTML, add a debug log
to help diagnose selector issues in new districts:

```typescript
const pageTitle = $('title').text().trim()
const hasAssignmentClass = $('.AssignmentClass').length
const hasSgHeader = $('.sg-header').length

console.log('[HAC CLIENT] getGrades page structure:', {
  pageTitle,
  hasAssignmentClass,
  hasSgHeader,
  htmlLength: typeof res.data === 'string' ? res.data.length : 0,
})

if (hasAssignmentClass === 0) {
  console.warn('[HAC CLIENT] No .AssignmentClass elements found. Page may use different selectors.')
  console.warn('[HAC CLIENT] Page title:', pageTitle)
  // Still return empty array — do not throw
}
```

---

## TypeScript Requirements

```bash
cd backend
npx tsc --noEmit
```

Watch for:
- Cheerio type issues with `$el` — use `cheerio.Cheerio<cheerio.Element>`
- The helper functions `extractPeriod` and `extractAverage` must be defined
  BEFORE `getGrades()` in the file (JavaScript hoisting does not apply to
  `const` functions)
- `colIdx` is defined inside the loop — ensure it does not conflict with
  outer scope

---

## Acceptance Criteria

- [ ] Period extraction uses multi-strategy fallback
- [ ] Average extraction uses multi-strategy fallback  
- [ ] Assignment column mapping is header-driven with hardcoded fallback
- [ ] Course name parsing strips period indicators correctly
- [ ] `getStudentInfo` uses `trySelectors` with multiple fallbacks per field
- [ ] Debug log added to `getGrades` showing page structure
- [ ] `npx tsc --noEmit` passes in `backend/`

---

## What NOT to Do

- Do NOT remove the original hardcoded indices — use them as fallback
- Do NOT throw errors when selectors produce empty results — return empty values
- Do NOT change function signatures or return types
- Do NOT change `normalizeGrades.ts` in this fix
