# RUN_ALL — Class Average Fix

Run these prompts in order. Do NOT run PROMPT_02 until PROMPT_01 has
produced a complete DIAGNOSIS REPORT.

---

## Execution Order

### 1. Run PROMPT_01_DIAGNOSE.md
- Paste the full contents into Claude Code
- Wait for the DIAGNOSIS REPORT at the end
- Review it yourself — confirm the root cause makes sense
- Do NOT proceed if the diagnosis is unclear or says "not sure"

---

### 2. Run PROMPT_02_FIX.md
- Paste the full contents into Claude Code (same session as PROMPT_01, or a new one — both work)
- Claude Code will re-read the files before editing
- Only one fix (A, B, or C) will be applied based on the diagnosis
- A TypeScript check will run at the end to confirm no errors

---

## What to check after both prompts complete

1. Restart your backend server
2. Reload the grades page in the browser
3. Class average should appear on each course card/row
4. If it still doesn't appear, check the browser console for the API response shape:
   open DevTools → Network tab → find the grades API call → check the JSON response
   and confirm `classAverage` (or whatever field name) is present

---

## If something goes wrong

- If PROMPT_02 introduces a TypeScript error, paste the error back into Claude Code
  and ask it to fix only that error without changing anything else
- If the class average shows as `null` or `undefined` on screen, the scraper may
  not be returning it for all courses — that is a separate issue in the HAC client,
  not the frontend display layer
