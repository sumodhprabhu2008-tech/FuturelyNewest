# PROMPT 01 — Diagnose: Class Average Not Displaying

## Your task
You are a diagnostic agent. Do NOT modify any files yet.
Your only job is to trace exactly why the class average is not showing on the grades page,
and produce a clear written diagnosis at the end.

---

## Step 1 — Map the project structure

Run the following and read the output carefully:

```bash
find C:/Users/srika/Futurely-main -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) | sort
```

Also read the top-level directory to understand the folder layout:

```bash
ls -la C:/Users/srika/Futurely-main
```

---

## Step 2 — Find and read the HAC scraper

Search for the scraper file(s) — likely named `hacClient.ts`, `scraper.ts`, `hac.ts`, or similar:

```bash
find C:/Users/srika/Futurely-main -type f -name "*.ts" | xargs grep -l -i "average\|classAvg\|classAverage\|avg" 2>/dev/null
```

Read every file that appears. Pay close attention to:
- What fields are returned in the grades/courses data shape
- The exact key name used for class average (e.g. `classAverage`, `avg`, `average`, `classAvg`, `CAV`, etc.)
- Whether it is nested inside a course object or returned at the top level

---

## Step 3 — Find and read the API route that serves grades

Search for the API endpoint that the frontend calls to get grades:

```bash
find C:/Users/srika/Futurely-main -type f \( -name "*.ts" -o -name "*.js" \) | xargs grep -l -i "grades\|courses\|gpa" 2>/dev/null
```

Read each relevant route/controller file. Confirm:
- Does the API route pass the class average field through to the response?
- Or does it destructure/map the scraper output and accidentally drop the class average field?

---

## Step 4 — Find and read the grades page / component

Search for the frontend grades display:

```bash
find C:/Users/srika/Futurely-main -type f \( -name "*.tsx" -o -name "*.jsx" -o -name "*.js" \) | xargs grep -l -i "grades\|GradesPage\|CourseList\|classAverage\|average" 2>/dev/null
```

Read every matching component or page file. Look for:
- Where does it render the class average? (Is there a `{course.classAverage}` or similar in the JSX/TSX?)
- Is it commented out, conditionally hidden, or simply never referenced?
- What data shape does the frontend expect vs what the API actually returns?

---

## Step 5 — Check the data flow end to end

Based on your reading, answer ALL of the following in your diagnosis report:

1. **What is the exact field name** the scraper uses for class average? (e.g. `classAverage`, `avg`, `CAV`)
2. **Does the API route include that field** in its response JSON, or does it get dropped?
3. **Does the frontend reference that field** anywhere in the grades page/component?
4. **If the frontend references it**, is the field name it expects a match to what the API returns?
5. **Is there any conditional logic** (e.g. `if (average !== null)`) that might be hiding it?
6. **What is the exact component or file** where the fix needs to happen?

---

## Output format

End your response with a section titled:

```
## DIAGNOSIS REPORT
```

That report must contain:
- Root cause (one sentence)
- The exact file(s) that need to be changed
- The exact field name mismatch or missing reference
- A recommendation: is this a backend fix, frontend fix, or both?

Do NOT make any edits. Only read and report.
