---
name: execute-plan-task
description: Execute specific task(s) from a plan file by ID
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, EnterPlanMode, mcp__ide__getDiagnostics
argument-hint: <plan path> <task IDs, e.g. A.1 A.2 or B.1-B.3>
---

Execute specific tasks from a plan file by ID, updating the plan document as you go.

## Input

`$ARGUMENTS` contains a plan file path followed by one or more task IDs.

Examples:
- `plan/calorie-log-plan.md A.1` — execute task A.1
- `plan/calorie-log-plan.md A.1 A.2 A.3` — execute tasks A.1, A.2, A.3 in order
- `plan/calorie-log-plan.md B.1-B.5` — execute tasks B.1 through B.5 in order
- `plan/calorie-log-plan.md C` — execute all tasks in phase C

## Process

1. **Read the plan file.** Parse all tasks — lines matching `- [ ] **{id} — {title}**` and `- [x] **{id} — {title}**`. Parse the task IDs from the arguments.

2. **Resolve the requested tasks.** Match the provided IDs against the plan:
   - Single IDs like `A.1` match exactly.
   - Ranges like `B.1-B.3` expand to all tasks from B.1 to B.3 inclusive.
   - Phase letters like `C` match all tasks starting with that letter (C.1, C.2, etc.).
   - If any requested task ID doesn't exist in the plan, stop and tell the user.

3. **Show the user a summary** of the tasks you're about to execute. Note any that are already completed (`- [x]`) — skip those unless the user says to re-run them.

4. **Execute the resolved tasks in plan order.** For each task:
   a. Read the task description from the plan to understand what needs to be done.
   b. Announce which task you're starting: `## Starting: {id} — {title}`
   c. Implement the task. Use sub agents for independent research or parallel work where appropriate.
   d. After implementation, run relevant checks (build, lint, typecheck, tests) to verify the task is complete.
   e. **Update the plan file:** change `- [ ]` to `- [x]` for that task. Do this immediately after each task — do not batch these updates.
   f. Briefly state what you changed and which files were affected.

5. **If a task fails or is blocked:**
   - Stop execution.
   - Do NOT mark the task as complete.
   - Explain what went wrong and ask the user how to proceed.

6. **When done**, show a summary of what was completed.

## Rules

- **Only execute the requested tasks.** Do not run tasks that weren't specified.
- **One task at a time.** Complete and check off each task before starting the next.
- **Update the plan file after every task.** The plan file is the source of truth. If you crash or get interrupted, the user can resume from where you left off.
- **Do not modify task descriptions.** Only change `- [ ]` to `- [x]`. The plan content stays as-is.
- **Follow CLAUDE.md rules.** Minimal changes, no unnecessary refactoring, run checks after changes.
- **Commit nothing.** Do not create git commits. The user will commit when ready.
