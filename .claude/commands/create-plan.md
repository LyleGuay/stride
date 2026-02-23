---
name: create-plan
description: Create a detailed implementation plan from a description or pre-plan file
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Task, Write, AskUserQuestion
argument-hint: <description or path to pre-plan file>
---

Create a detailed implementation plan based on the user's input.

## Input

`$ARGUMENTS` is either:
- A description of what the user wants to accomplish, OR
- A path to a file containing pre-plan notes (read the file first)

If the input looks like a file path, read it. Otherwise treat it as a direct description.

## Process

1. **Understand the goal.** Read any referenced files or pre-plan notes. If the input is ambiguous, ask clarifying questions before proceeding.
2. **Research the codebase.** Explore relevant code to understand current architecture, patterns, and files that will be affected. Use sub agents for broad exploration.
3. **Draft the plan.** Break the work into phases and tasks. Each task should be concrete and reference specific files.
4. **Ask the user what to name the plan file.** Suggest a default based on the topic (e.g. `calorie-log-plan.md`).

## Output

Write a `{name}-plan.md` file to the `plan/` directory with this structure:

```markdown
# {Title}

## Goal

{One paragraph summary of what we're building and why.}

## Rules

{If the pre-plan defined any rules or constraints, copy them here verbatim. If none, omit this section.}

## Phases

### Phase A: {Phase Name}

- [ ] **A.1 — {Task title}**
  {What to do and why. Reference specific files: `path/to/file.go`, `path/to/other.ts`.}

- [ ] **A.2 — {Task title}**
  {What to do and why.}

### Phase B: {Phase Name}

- [ ] **B.1 — {Task title}**
  {What to do and why.}
```

## Rules for the plan content

- Every task must reference at least one specific file to create or modify.
- Tasks should be small enough to implement in one sitting.
- Order tasks so each phase is independently shippable when possible.
- Do not include generic steps like "write tests" or "add error handling" as standalone tasks — fold them into the task they belong to.
- Be specific. "Update the handler" is bad. "Add a `POST /api/calories` route to `go-api/main.go` that inserts a calorie log item" is good.
- If a task requires a new file, say so and suggest the path.
- **Every feature or bug fix must include tests.** Explicitly scope out what tests are needed and include them as tasks in the same phase as the code they cover — not a separate phase at the end. Use the right layer:
  - Go unit tests for pure functions and business logic (e.g. `tdee_test.go`)
  - Vitest tests for web-client hooks and utilities (e.g. `useDailySummary.test.ts`)
  - Vitest component tests for components with non-trivial logic — form validation, mode switching, keyboard navigation, computed display thresholds. Skip purely presentational components.
  - Playwright E2E tests for new critical user flows (e.g. a new page or primary action)
