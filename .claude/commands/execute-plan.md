---
name: execute-plan
description: Execute tasks from a plan file, checking them off as each is completed
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, EnterPlanMode, mcp__ide__getDiagnostics
argument-hint: <path to plan file, e.g. plan/calorie-log-plan.md>
---

Execute the tasks in a plan file, updating the plan document as you go.

## Input

`$ARGUMENTS` is a path to a plan file (e.g. `plan/calorie-log-plan.md`). Read it first.

## Process

1. **Read the plan file.** Parse all tasks — lines matching `- [ ] **{id} — {title}**`. Identify which tasks are already completed (`- [x]`). Determine which tasks remain.

2. **Show the user a summary** of what's done and what's remaining. Ask if they want to proceed with all remaining tasks or select specific ones.

3. **Execute tasks sequentially.** For each unchecked task:
   a. Read the task description from the plan to understand what needs to be done.
   b. Announce which task you're starting: `## Starting: {id} — {title}`
   c. Implement the task. Use sub agents for independent research or parallel work where appropriate.
   d. After implementation, run relevant checks (build, lint, typecheck, tests) to verify the task is complete.
   e. **Update the plan file:** change `- [ ]` to `- [x]` for that task. Do this immediately after each task — do not batch these updates.
   f. Briefly state what you changed and which files were affected.

4. **If a task fails or is blocked:**
   - Stop execution.
   - Do NOT mark the task as complete.
   - Explain what went wrong and ask the user how to proceed.

5. **When all tasks are done** (or the user stops you), read the final plan file and show a summary of completed vs remaining tasks.

## Rules

- **One task at a time.** Complete and check off each task before starting the next.
- **Update the plan file after every task.** The plan file is the source of truth. If you crash or get interrupted, the user can resume from where you left off.
- **Do not skip tasks.** Execute them in order unless the user says otherwise.
- **Do not modify task descriptions.** Only change `- [ ]` to `- [x]`. The plan content stays as-is.
- **Follow CLAUDE.md rules.** Minimal changes, no unnecessary refactoring, run checks after changes.
- **Commit nothing.** Do not create git commits. The user will commit when ready.
