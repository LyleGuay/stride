---
name: review-staged
description: Review staged changes for bugs, security issues, code smells, and architectural problems
allowed-tools: Bash, Read, Grep
---

Review the currently staged changes and produce a structured code review.

## Process

1. Run `git diff --cached` to get the staged diff. If nothing is staged, tell the user and stop.
2. For context, read any files with substantial changes — focus on the surrounding code, not just the diff lines.
3. Review the changes across these dimensions:

**Correctness**
- Logic errors or off-by-one bugs
- Unhandled error cases or missing null checks
- Race conditions or incorrect async handling
- Broken or missing edge case handling

**Security**
- Injection vulnerabilities (SQL, command, XSS)
- Sensitive data exposed in logs, responses, or client-side code
- Missing auth/authz checks
- Insecure defaults or dangerous configurations

**Code quality**
- Code smells: duplication, overly complex logic, unclear naming
- Premature abstraction or missing abstraction
- Dead code or unused variables
- Violations of patterns established in the surrounding codebase

**Architecture**
- Coupling that violates layer boundaries (e.g. DB logic leaking into handlers)
- Changes that will make future work harder
- Inconsistency with the conventions in this codebase

## Output format

Start with a one-paragraph summary of what the changes do and an overall assessment.

Then list findings in priority order (CRITICAL → HIGH → MED → LOW):

**[PRIORITY] Finding name** - `file:line` (if applicable)
Description of the issue.
Suggestion: what to do about it (if not obvious).

If there are no findings at a given severity, skip that level.
If there are no findings at all, say so — "No issues found" with a brief explanation of what looks good.

## Rules

- Be direct. No filler, no praise for non-issues.
- Only flag real problems, not style preferences unless they contradict codebase conventions.
- LOW = nitpick or minor smell. MED = should fix before merging. HIGH = likely to cause a bug or be exploited. CRITICAL = must fix, do not merge.
- If you're uncertain whether something is a bug, flag it as LOW or MED and explain the uncertainty.
