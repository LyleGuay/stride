# Tasks — Expanded Feature Set

Ideas beyond the v1 spec. Some are small polish, some are larger features. Grouped by theme.

---

## AI-Powered Features

These leverage the existing OpenAI integration (already used in calorie suggestions) and would make Stride's task module meaningfully smarter than Todoist or Things.

### AI Time Estimate
A small AI star button next to the time estimate field. When tapped, sends the task title + description to the AI and returns a suggested estimate (e.g., "~45 min"). The user can accept, edit, or ignore it. Pairs naturally with the time estimate field below.

- Trigger: star/sparkle icon button inline with the estimate input
- Input: task name + description
- Output: duration string (e.g., "~30 min", "~2 hrs")
- Same API pattern as `POST /api/calorie-log/suggest`

### AI Task Create
Give the AI a short freeform description and it generates all task fields: name, description, priority, due date (relative to today), and suggested tags. A "✦ Create with AI" button in the Add Task sheet opens a single textarea prompt. The AI response populates the form, which the user can review and save.

- Good for brain-dump capture: "remind me to call the dentist before end of month, medium priority"
- Reduces the friction of filling out multiple fields for tasks the user already has a clear mental model of

### AI Task Description
When editing a task that has a name but no description, a small "✦ Generate" button appears next to the description field. The AI generates a helpful description based on the task name — context, suggested approach, things to remember. The user can accept as-is or edit.

- Useful for vague task names ("Refactor auth module", "Research gym options")
- Low-friction way to turn a quick capture into something actionable

---

## Cross-Module Integration

Stride's unfair advantage over standalone task apps: it knows about your habits, energy, journal, and food. These features exploit that.

### Energy-Aware Task Surfacing
When you log feeling "tired" or "sick" in the journal today, the Today view could visually flag high-effort tasks (e.g., a soft gray wash or tooltip) or auto-sort lighter tasks to the top. No task app can do this because none know how you feel.

### Cancel → Journal Prompt
When you cancel a task, show a micro-prompt: "Why did you drop this?" One line, optional. Stored as a note on the canceled task, visible on hover in the Canceled filter. Creates an accountability loop and a lightweight record of intentional decisions.

### Weekly Task Review (Integrated)
A weekly summary that shows tasks completed + missed alongside habit streaks — not a separate screen, but part of the same weekly digest email. Everything Todoist sends in a weekly email, but tied to your actual weekly rhythm and health data.

### Daily Digest Column
The planned daily digest email should include tasks (due today, overdue count) alongside habits and calorie summary — a full daily brief so you're not switching apps to plan your day.

---

## Smarter Task UX

Small things that most apps do poorly or not at all.

### Time Estimate Field
A lightweight "~30 min" label on tasks. No timer, no tracking — just planning intent. The Upcoming view could sum estimates per day: "Tomorrow · 3 tasks · ~2.5 hrs." Helps you decide if a day is actually feasible before it starts.

### Backlog Aging Indicator
Tasks that have been in Backlog for 30+ days get a subtle visual indicator ("30+ days"). Forces a decision: schedule it or delete it. Backlogs in every app quietly become graveyards — this fights that with zero overhead.

### Overdue Age (not just "overdue")
Instead of just red text, show "3 days overdue" inline on task rows. Adds appropriate weight to neglect without nagging. Makes the cost of avoidance visible.

### Natural Language Due Dates
Type "next Friday", "in 3 days", or "end of month" in the date field and it parses it inline. Fantastical does this well; almost no productivity app handles it gracefully. Could be a lightweight client-side parser with AI fallback for ambiguous inputs.

---

## Reflection & Accountability

### "Why did you cancel this?" History
Cancel notes (from the prompt above) are stored and visible on canceled tasks in the All tab. Over time this becomes a useful record of decisions made, not just things that didn't get done.

### Task Completion as a Meta-Habit
Track "tasks completed today" as a background metric. No dedicated UI needed — just feed it into the weekly digest as a pattern. If habit streaks are motivating, this adds the same pull to task throughput.

---

## Priority Order (effort vs. payoff)

| Feature | Effort | Payoff | Notes |
|---------|--------|--------|-------|
| AI Time Estimate | Low | High | Reuses existing OpenAI integration |
| AI Task Description | Low | High | Same pattern, single API call |
| AI Task Create | Medium | High | More complex prompt + form population |
| Overdue age | Very Low | Medium | One line of UI |
| Backlog aging | Very Low | Medium | CSS + date comparison |
| Cancel → journal prompt | Low | High | Unique differentiator |
| Time estimate field | Low | Medium | Prerequisite for AI estimate |
| Natural language dates | Medium | Medium | Client-side parser or AI |
| Energy-aware surfacing | High | High | Requires journal integration |
| Weekly task review | Medium | High | Tied to digest feature |
