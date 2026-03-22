# Notifications — Daily Digest Email

## Overview

A scheduled email sent each morning that gives a single-glance picture of what the day looks like: overdue tasks, tasks due today, and habits that need to be done today or this week. The goal is that opening Stride first thing is optional — the email itself is actionable enough to start the day, and deep-links back into the app for anything that needs attention.

Phase 1 is email only. Push notifications (PWA/Android) are a natural follow-on but out of scope here.

## User Stories

- As a user, I want a morning email showing everything I need to do today so I can plan before opening the app.
- As a user, I want overdue tasks prominently called out so nothing slips through the cracks.
- As a user, I want to see which habits are due today (daily) and which weekly habits I still need to hit so I can prioritize without logging in.
- As a user, I want to configure what time the email arrives so it fits my morning routine.
- As a user, I want to be able to turn the digest off without deleting my account.

---

## Email Content

Sent once per day at the user's configured time (default: 7:00 AM, user's local timezone).

**Subject line:** `Your day — {Day}, {Month} {Date}` (e.g. "Your day — Sunday, Mar 22")

**Sections (only included if non-empty):**

### 1. Overdue Tasks
Tasks with `due_date < today` and `status IN ('todo', 'in_progress')`.
Sorted by due date ascending (oldest first).
Section header is red. Each row shows:
- Priority color swatch
- Task name
- Due date (e.g. "Mar 17")
- Status badge if In Progress

### 2. Due Today
Tasks with `due_date = today` and `status IN ('todo', 'in_progress')`.
Sorted by: due_time asc (time-set tasks first), then priority, then name.
Each row shows:
- Priority color swatch
- Task name
- Time if set (e.g. "2:00 PM"), otherwise nothing

### 3. Habits — Today
**Daily habits** with no log entry for today.
**Weekly habits** where the count of logs this week < `weekly_target`.

Displayed as two sub-lists:
- "Daily" — habits that fire every day
- "Weekly ({n} of {target} done)" — habits with a weekly target, showing progress

Each habit row shows emoji + name + current streak (if > 0).

### 4. Footer
- "Open Stride →" CTA button (links to app)
- "Manage notification settings" link
- Plain-text unsubscribe link

**Sections omitted when empty:** if there are no overdue tasks, that section is skipped entirely. If all habits are complete, the habits section is skipped. If no tasks at all, a brief "Nothing due today — enjoy your day." line replaces both task sections.

---

## Settings

A **Notifications** section is added to the existing Settings page, below the existing profile/budget sections.

**Controls:**
- Toggle: "Daily digest email" (on/off)
- Time picker: "Send at" — dropdown or time input, defaulting to 7:00 AM
- Timezone: auto-detected from browser on first save; displayed for confirmation

These settings are persisted in the DB (see Data section).

---

## Technical Design

### Email Provider

**Resend** (`resend.com`) — simple REST API, excellent Go support (`github.com/resend/resend-go`), generous free tier (3,000 emails/month), good deliverability. One API key env var.

### Scheduler

A goroutine launched from `main.go` that:
1. Runs a check loop every minute
2. For each user with `daily_email_enabled = true`, checks if `now()` in the user's timezone matches their configured send time (within the current minute window)
3. Fires the digest if it hasn't already been sent today (tracked by `last_digest_sent_at`)

No external cron infrastructure needed — the Go process manages it internally. If the server restarts mid-day and a digest was already sent, `last_digest_sent_at` prevents a duplicate.

### Email Rendering

Go `html/template` renders the email HTML. A plain-text fallback is also rendered for email clients that don't support HTML. Both are sent via Resend's `text` + `html` fields.

Template lives at `go-api/templates/daily-digest.html`.

### New env vars (`go-api/.env`)
```
RESEND_API_KEY=re_...
APP_URL=https://stride.app   # used for deep-links in emails
```

---

## Data

```sql
-- Separate table — not tied to calorie log settings.
-- Owns all future notification preferences (push, reminders, etc.)
CREATE TABLE user_notification_settings (
  user_id               int         PRIMARY KEY REFERENCES users(id),
  daily_email_enabled   bool        NOT NULL DEFAULT false,
  daily_email_time      time        NOT NULL DEFAULT '07:00:00',
  timezone              text        NOT NULL DEFAULT 'America/New_York',
  last_digest_sent_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

Row is created on first save of notification settings (upsert). One row per user.

**API routes:**
- `GET  /api/notification-settings` — fetch current settings
- `PATCH /api/notification-settings` — update; accepts `daily_email_enabled`, `daily_email_time`, `timezone`

No trigger route needed — the digest is sent server-side on schedule.

**Timezone handling:**
- Client sends `Intl.DateTimeFormat().resolvedOptions().timeZone` automatically on first save (e.g. `"America/Toronto"`).
- Stored as an IANA timezone string.
- User can override via a searchable dropdown in Settings. Displayed alongside the time picker so they can confirm it's correct.
- The scheduler uses `time.LoadLocation(timezone)` to convert `now()` to the user's local time before comparing against `daily_email_time`.

---

## Future: Push Notifications

When added, push notification preferences (enabled, quiet hours, per-type toggles) will be additional columns on `user_notification_settings`. The table name already reflects this broader scope, so no rename or migration needed.

---

## Decisions

| Question | Decision |
|----------|----------|
| Weekend behavior | Send every day — no skip |
| Deep-link target | App root (`APP_URL/`) |
| Timezone | Auto-detect from browser on first save; user can override via dropdown in Settings |
| Settings table | `user_notification_settings` — standalone, not attached to calorie log settings |

## Open Questions

1. **Habit "already done" filter:** The query should use `WHERE date = today` to exclude habits already logged today. Confirm `habit_logs.date` is always the calendar date (not a timestamp) — this appears true from the existing code but worth verifying.
2. **Email preview text:** Make it dynamic — e.g. "2 overdue · 3 due today · 5 habits" as a hidden `<div>` at the top of the email body. Low effort, high inbox impact.
