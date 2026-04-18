# CLAUDE.md

Project-wide conventions for Stride. Per-folder details live in each folder's own `CLAUDE.md`:

- **`go-api/CLAUDE.md`** — backend commands, architecture, migrations, feature/endpoint list, testing, env vars.
- **`web-client/CLAUDE.md`** — frontend commands, architecture, platform policy, pages, testing.
- **`e2e/CLAUDE.md`** — Playwright runbook, test-user pattern, isolation conventions, selector patterns.
- **`mobile-client/CLAUDE.md`** — inactive Expo scaffold.

When working inside one of those folders, Claude Code loads the folder's `CLAUDE.md` automatically. This root file is what all agents see.

## Project Overview

Stride is a personal life & productivity dashboard. **This is a personal hobby project built for one user.** There is no multi-tenant architecture, no iOS support, and no need to design for hypothetical future scale. The only mobile device is a Google Pixel (Android). Optimize for the current use case.

**Modules implemented today:**

- **Calorie Log** — daily/weekly/progress views, meal sections, AI-powered calorie/macro suggestions, favorites, recipe logging, weight tracking, TDEE-based budget auto-compute.
- **Recipes** — full CRUD, AI generate/modify/copy/nutrition, step-by-step execution view.
- **Habits** — proportional level logging (L1/L2/L3), weekly progress, streaks.
- **Journal** — daily entries (Markdown), mood + mental-state scoring, tags, Summary tab with Week/Month/6M/1Y/All ranges, calendar picker.
- **Tasks** — Today/Upcoming/All tabs, scheduled_date + deadline, recurrence, Complete-Forever.
- **Meal Planning** — weekly grid with food/takeout/recipe entries, copy-from-last-week, ghost rows in the calorie log for planned-but-unlogged items.

## Repo structure

```
stride/
  go-api/           Go backend (Gin + PostgreSQL via pgx) — active
  web-client/       React web app (Vite + Tailwind + PWA) — active, desktop + mobile web
  e2e/              Playwright E2E suite
  packages/shared/  Shared TypeScript types and pure utilities
  mobile-client/    Expo React Native scaffold — inactive
  db/
    migrations/     SQL migrations (run via go-api/cmd/migrate)
    misc/           one-off data scripts
  design/           mockups, research, feature specs
  plan/             implementation plans for in-progress features
```

**Note on mobile:** `web-client/` is a responsive PWA serving desktop and mobile web. Capacitor (Android wrapper) is planned but not yet integrated — see `plan/capacitor-mobile-plan.md`. Until Capacitor lands, treat the web-client as a web-only PWA. The `mobile-client/` Expo scaffold is kept as a fallback path but isn't actively developed.

## Core Behavior

- **Do only what is asked.** Do not refactor, reorganize, or "improve" code outside the scope of the current task.
- **Do not make assumptions.** If something is unclear, ask before proceeding. Do not guess at intent, architecture decisions, or business logic.
- **Verify before deleting or replacing.** Check that code is unused before removing it. Check that your replacement is functionally equivalent before rewriting.
- **Make minimal changes.** The smallest diff that solves the problem is the best diff.
- **If you're unsure, say so.** Flag uncertainty as an open question rather than making a best guess.

## Git

- **Never amend commits.** Always create a new commit for follow-up fixes. `git commit --amend` rewrites history and causes problems if the commit was already pushed.
- Folder-specific pre-commit checks (e.g. `npm run build && npm run lint` in `web-client/`) live in that folder's `CLAUDE.md`.

## Token Efficiency

- Do not read files you don't need. If the task is about `auth.controller.ts`, do not explore unrelated directories.
- Do not re-read files you've already read in this session unless they've changed.
- Keep responses concise. No preamble, no restating the task back to me, no "great question" filler.
- Batch related edits into a single operation when possible.
- When running commands, combine related checks (e.g., `npm run build && npm test`) rather than running them one at a time.

## Sub Agents / Task Tool

- Spawn sub agents freely when they'd speed things up or keep the main context clean.
- Common good uses: research, running tests, exploring unfamiliar code, reading many files, independent parallel work.
- **Don't spawn for trivial work** that takes 1-2 tool calls — just do it directly.
- Sub agents must have a specific, scoped instruction. No vague "look into this."
- Spawn multiple sub agents in parallel when the tasks are independent.
- **Model selection:** Use opus for anything requiring judgment or complex reasoning. Use sonnet for straightforward tasks (file reading, simple searches). Use haiku for trivial lookups.

## Comments

Use good judgment. The goal is that a developer reading the code for the first time can understand what's going on without guessing. Err on the side of commenting — a useful comment is always better than a missing one.

### What to comment

- **Functions/methods:** Brief comment explaining what it does. Every exported/handler function should have one.
- **Classes/Structs/types/interfaces:** should have a `/**/` explaining what it is, it's purpose and how it fits in the big picture.
- **Code blocks:** When a block of code has a distinct purpose (e.g. "build dynamic SET clause", "compute daily totals"), add a short comment above it explaining the block's intent. Use these liberally — they make scanning code much faster.
- **Why, not what.** Comment non-obvious _reasons_: workarounds, business logic, intentional error suppression, ordering dependencies, or anything a future reader would question.
- **Edge cases and gotchas.** If code handles a subtle case, say why.
- **API endpoints:** What the endpoint does, any notable behavior (defaults, side effects).

### What NOT to comment

- Do not restate what a single line obviously does. `// increment counter` above `counter++` is noise.
- Do not include `@param` or other JSDoc decotators unless it adds useful info.
- Do not leave `// TODO` comments unless I ask for them.
- Do not add commented-out code. Delete it; git has history.

### Style

- Use `//` for inline and block-level comments. Use `/* */` for file or section headers when it improves readability.
- Write in plain language, not formal doc-speak. "Clears cache because user permissions changed" not "This method is responsible for the invalidation of the cache subsequent to a modification of user permissions."

### Examples

```go
// GOOD — handler purpose
// getDailySummary returns calorie log items and computed totals for a given date.
func (h *Handler) getDailySummary(c *gin.Context) {

// GOOD — block comment explaining a section's purpose
// Build SET clause dynamically — only update fields the client provided
setClauses := []string{}
args := pgx.NamedArgs{"userID": userID}

// GOOD — struct purpose
// DateOnly wraps time.Time to serialize as "YYYY-MM-DD" in JSON responses.
type DateOnly struct{ time.Time }

// GOOD — explains a non-obvious decision
// We use a connection pool instead of a single conn because Neon
// closes idle connections after ~5 minutes.
pool, err := pgxpool.New(ctx, os.Getenv("DB_URL"))
```

```typescript
// GOOD — explains why
// Guard: org-level routes must verify the caller belongs to this org tree
@UseGuards(AccessOrganizationGuard)

// GOOD — explains intentional error suppression
// Safe to ignore — profile image is optional and we don't want to block user creation.
try { await uploadAvatar(file); } catch { }
```

## Keeping Documentation in Sync

When you change code, update any documentation or comments affected by the change:

- **Comments near changed code.** If a comment describes behavior you just changed, update it. Stale comments are worse than no comments.
- **Per-folder `CLAUDE.md`.** If you change architecture, add/remove commands, change table names, or update routes inside `go-api/` / `web-client/` / `e2e/`, update *that folder's* `CLAUDE.md`, not this root file.
- **Root `CLAUDE.md`** (this file). Only update when the project overview, module list, or repo structure changes — e.g. you added a new top-level module, or a planned-but-unimplemented feature became real.
- **README files.** If a README describes something you changed, update it.
- **Plan files.** Do not modify task descriptions in plan files — only check off completed tasks.

This is not optional. Outdated docs actively mislead, so treat doc updates as part of the change.

## Markdown

**All multi-line description/body fields across the app support Markdown.** This includes journal entry bodies, task descriptions, and any future freeform text field. The frontend renders these with a markdown-aware editor (matching the journal's implementation) rather than a plain `<textarea>`. When adding a new description field to any module, use the same markdown editor component — do not use a plain textarea.

## Changes and Testing

- Run the relevant linter/typecheck after making changes. Fix issues before moving on.
- Run relevant tests after changes. Do not mark work as done if tests fail.
- Do not modify test expectations to make tests pass unless the test was wrong. If a test fails, fix the code.
- **Every feature or bug fix should include corresponding tests.** When building a plan, explicitly scope out what tests are needed — Go unit tests for pure logic, Vitest tests for web-client hooks/utilities, Playwright E2E for new critical web flows (including `*-mobile.spec.ts` for mobile viewport coverage), and manual test steps for anything touching native device behavior. Test tasks belong in the same phase as the code they cover, not a separate phase at the end.

### Testing philosophy (applies everywhere)

Coverage percentage is not a goal. A test is worth writing if it would catch a real bug or if breaking the logic would break the test. If renaming a variable causes a test to fail, that test is testing implementation — it should be deleted.

**Test behaviour, not implementation.** Before writing a test, ask: *"Could this code be wrong in a way that's non-obvious and hard to spot manually?"* Pure business logic with real edge cases — yes. A component rendering without crashing — no.

Folder-specific testing conventions (what tools, what to test, what to skip) live in each folder's `CLAUDE.md`.

### CI order of operations

When introducing tests to an existing codebase:
1. Write E2E tests first — they become the safety net for structural refactoring.
2. Do structural refactoring (extract utilities, lift data fetching, split files).
3. Add unit/hook tests for the newly extracted, well-shaped code.

## Linear

All Linear issues must be added to the **Stride** project (`939cc8a9-92ac-4ece-917a-82dbb67c3ada`). When creating issues, always pass `project: "Stride"` or the project ID.

## Communication

- When starting a task, briefly state your approach before writing code.
- When done with a task, state what you changed and what files were affected.
- If you discover something broken that is outside the current task, mention it but don't fix it.
