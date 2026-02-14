---
name: design
description: Design an app screen or feature — research, spec, and HTML mockups
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, WebSearch, WebFetch, AskUserQuestion
argument-hint: <feature or screen description, e.g. "calorie log daily view">
---

Help the user design an app screen or feature. Produce a written design spec and interactive HTML mockups.

## Input

`$ARGUMENTS` is a description of what the user wants to design (e.g. "calorie log daily view", "habit tracker weekly summary").

## Process

### 1. Gather Context

- Read any existing design docs in `design/` that are relevant.
- Read any existing code or components in `web-client/` related to this feature.
- If the user references a specific file or screenshot, read it.
- Ask clarifying questions if the scope is unclear. Understand: who is the user, what are they trying to accomplish, what data is involved.

### 2. Research Reference Apps

- Use WebSearch to find 3-5 well-known apps that have a similar feature or screen.
- For each reference, note:
  - App name and what it does well for this feature
  - Key design patterns it uses (layout, interaction, data display)
  - Link to the app or relevant page
- Summarize findings for the user before proceeding. Ask if any of the reference approaches resonate or if they want to go a different direction.

### 3. Write the Design Spec

Write a markdown file to `design/{feature-name}.md` with this structure:

```markdown
# {Feature/Screen Name}

## Overview

{What this screen/feature does and why it exists. One paragraph.}

## User Stories

- As a user, I want to {goal} so that {reason}.
- ...

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| {App name} | {Observation} | {e.g. bottom sheet, card list, inline edit} |

## Screens

### {Screen Name}

**Purpose:** {What the user accomplishes here.}

**Layout:**
{Describe the layout top-to-bottom: header, main content areas, actions, navigation.}

**Components:**
- {Component name} — {what it shows and how it behaves}
- ...

**States:**
- Empty: {What the user sees when there's no data}
- Loaded: {Normal state}
- Error: {What happens on failure}

**Interactions:**
- {Action} → {Result}
- ...

### {Next Screen}
...

## Data

{What data this feature needs. Reference existing DB tables or describe new ones needed.}

## Open Questions

- {Anything unresolved or needing user input.}
```

### 4. Generate HTML Mockups

Create standalone HTML files in `design/mockups/{feature-name}/` that the user can open in a browser.

Rules for mockups:
- **One HTML file per screen.** Name them `{screen-name}.html`.
- **Use Tailwind CSS via CDN** (`<script src="https://cdn.tailwindcss.com"></script>`). No build step needed.
- **Mobile-first.** Default to a phone-width layout (`max-w-md mx-auto`), since this is a PWA.
- **Use realistic placeholder data.** Not "Lorem ipsum" — use data that looks like what the user would actually see (e.g. real food names, plausible calorie counts).
- **Make it interactive where useful.** Buttons that show/hide panels, tabs that switch content, modals that open — use inline JS for simple interactions.
- **Keep it self-contained.** Each HTML file must work when opened directly in a browser. No external dependencies beyond the Tailwind CDN.
- **Match the project's visual direction.** If there are existing components or design tokens in the project, reference them. Otherwise default to a clean, minimal style.

### 5. Present to the User

- Show the file paths you created.
- Suggest they open the HTML mockups in a browser to review.
- Ask for feedback: what to change, what's missing, what to iterate on.

## Rules

- Do not write application code. This command produces design artifacts only.
- Do not modify existing code files.
- Ask before making major design decisions (e.g. navigation pattern, layout approach).
- If the user provides screenshots or images, analyze them carefully and incorporate what works.
