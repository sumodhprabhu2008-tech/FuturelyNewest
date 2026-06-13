# PROMPT 02 — Fix: Class Average Not Displaying

## Context
The HAC scraper already returns class average data in the API response.
The class average is not appearing on the grades page of the website.
The diagnosis from PROMPT_01 has identified the root cause.

**Before writing a single line of code, you MUST re-read every file you are about to modify.**
Do not rely on memory. Read, then fix.

---

## Step 1 — Re-read all files you will touch

Read each file identified in the PROMPT_01 diagnosis report.
Also read the following files if you have not already:

- The HAC scraper/client file (wherever `classAverage` or equivalent is returned)
- The API route file that serves grades data to the frontend
- The grades page or component file that renders courses
- Any TypeScript type/interface files that define the course or grade data shape
  (search for them like this):

```bash
find C:/Users/srika/Futurely-main -type f -name "*.ts" | xargs grep -l -i "interface\|type Course\|type Grade\|ClassAverage" 2>/dev/null
```

Do not skip this step. Reading the actual file content is required before editing.

---

## Step 2 — Identify and fix the exact break point

Apply ONE of the following fixes based on what the diagnosis found.
Only apply the fix that matches your diagnosis — do not apply all of them speculatively.

---

### FIX A — The API route is dropping the class average field

If the API route maps/destructures the scraper output and omits class average:

Find the route handler and ensure the class average field is included in the response.

Example of the problem pattern:
```typescript
// BAD — drops classAverage
const courses = scrapedData.map(c => ({
  name: c.name,
  grade: c.grade,
}));
```

Example of the fix:
```typescript
// GOOD — preserves classAverage (use whatever the real field name is)
const courses = scrapedData.map(c => ({
  name: c.name,
  grade: c.grade,
  classAverage: c.classAverage, // ← add the missing field
}));
```

After editing: run `tsc --noEmit` from the backend directory to confirm no TypeScript errors.

---

### FIX B — The frontend component doesn't render class average

If the API is returning the field but the component never displays it:

Find the grades page/component and add a display for class average in the course card or row.

Example of the fix (adapt to whatever JSX/TSX structure already exists):
```tsx
{/* Add this where each course is rendered */}
{course.classAverage !== undefined && course.classAverage !== null && (
  <Text style={styles.classAverage}>
    Class Avg: {course.classAverage}
  </Text>
)}
```

Match the styling to how the existing grade or assignment fields are styled.
Do NOT invent new style classes — reuse the existing ones.

After editing: run `tsc --noEmit` from the frontend directory to confirm no TypeScript errors.

---

### FIX C — Field name mismatch between API and frontend

If the API returns (for example) `avg` but the frontend looks for `classAverage`:

Pick ONE side to fix — prefer fixing the frontend to match the backend, since the scraper is already correct.

Update the frontend reference:
```tsx
// Before (wrong field name)
{course.classAverage}

// After (correct field name matching the API)
{course.avg}
```

Also update any TypeScript interface or type definition that declares the course shape
to include the correct field name and type (likely `number | null` or `string | null`).

After editing: run `tsc --noEmit` to confirm no TypeScript errors.

---

## Step 3 — Update TypeScript types if needed

If the course/grade interface does not include the class average field, add it now.

Find the interface (likely in a `types.ts`, `models.ts`, or inline in the component):

```typescript
interface Course {
  name: string;
  grade: number;
  // Add this if missing:
  classAverage: number | null;
}
```

Use whatever the actual field name is. Do not guess — use the name confirmed by the diagnosis.

---

## Step 4 — Verify

After making all edits:

1. Run TypeScript check from both frontend and backend directories:
   ```bash
   cd C:/Users/srika/Futurely-main && tsc --noEmit
   ```

2. Confirm the data flows correctly by describing:
   - The exact field name in the scraper output
   - The exact field name in the API response
   - The exact JSX/TSX reference in the component
   - That all three match

3. Do NOT restart servers or run the app — leave that to the developer.

---

## Rules
- Read every file before editing it
- Preserve all existing logic — do not refactor anything unrelated to class average
- One targeted change only — do not clean up, rename, or restructure anything else
- If you are uncertain about any field name, STOP and ask before proceeding
