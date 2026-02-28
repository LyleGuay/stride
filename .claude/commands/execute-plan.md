---
name: execute-plan
description: Execute tasks from a plan file, checking them off as each is completed
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, EnterPlanMode, mcp__ide__getDiagnostics
argument-hint: <path to plan file> [phase/task selectors, e.g. A or A.1 or A,B.1 or A-C]
---

Execute tasks from a plan file, updating the plan document as you go.

## Input

`$ARGUMENTS` is a plan file path, optionally followed by one or more selectors that narrow which tasks to run.

**Selector syntax:**
- No selector — run all remaining (unchecked) tasks in the plan
- `A` — all tasks in phase A
- `A.1` — a single task
- `A.1 A.2` or `A.1, A.2` — specific tasks (space- or comma-separated)
- `A-C` — all tasks in phases A through C inclusive
- `A, B.1` — mixed: all of phase A, plus task B.1

Examples:
- `plan/calorie-log-plan.md` — run entire plan
- `plan/calorie-log-plan.md A` — run all tasks in phase A
- `plan/calorie-log-plan.md A.1` — run task A.1 only
- `plan/calorie-log-plan.md A.1 A.2` — run A.1 then A.2
- `plan/calorie-log-plan.md A-C` — run all tasks in phases A, B, and C
- `plan/calorie-log-plan.md A, B.1` — run all of phase A, then task B.1

## Process

1. **Read the plan file.** Parse all tasks — lines matching `- [ ] **{id} — {title}**` and `- [x] **{id} — {title}**`.

2. **Resolve the task list to execute:**
   - If no selectors were given: collect all unchecked tasks in plan order.
   - If selectors were given: resolve each selector against the plan, then deduplicate while preserving order.
     - `A` → all tasks whose ID starts with `A.`
     - `A.1` → exact match
     - `A-C` → all tasks in phases A, B, and C
   - If any selector matches nothing in the plan, stop and tell the user.
   - Already-completed (`- [x]`) tasks in the resolved list: skip them and note this in the summary, unless the user explicitly asks to re-run them.

3. **Show the user a summary** of which tasks will run, which are already done and will be skipped, and ask for confirmation before proceeding.

4. **Execute tasks sequentially.** For each task:
   a. Read the task description from the plan to understand what needs to be done.
   b. Announce which task you're starting: `## Starting: {id} — {title}`
   c. Implement the task. Use sub agents for independent research or parallel work where appropriate.
   d. After implementation, run relevant checks (build, lint, typecheck, tests) to verify the task is complete.
   e. **Update the plan file:** change `- [ ]` to `- [x]` for that task immediately — do not batch these updates.
   f. Briefly state what you changed and which files were affected.

5. **If a task fails or is blocked:**
   - Stop execution.
   - Do NOT mark the task as complete.
   - Explain what went wrong and ask the user how to proceed.

6. **When all tasks are done** (or the user stops you), show a summary of completed vs remaining tasks.

## Rules

- **One task at a time.** Complete and check off each task before starting the next.
- **Update the plan file after every task.** The plan file is the source of truth — if execution is interrupted, the user can resume from where you left off.
- **Do not modify task descriptions.** Only change `- [ ]` to `- [x]`. Plan content stays as-is.
- **Follow CLAUDE.md rules.** Minimal changes, no unnecessary refactoring, run checks after changes.
- **Commit nothing.** Do not create git commits. The user will commit when ready.
