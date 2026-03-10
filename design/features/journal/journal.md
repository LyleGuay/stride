# Journal

## Overview

The Journal module lets the user capture timestamped text entries throughout the day, each tagged with an emotion (Happy, Anxious, Frustrated…) and an optional type label (Thought, Idea, Venting…). Entries can also be linked to a habit or calorie log item, giving context to what triggered the entry. The Summary view surfaces a mental-state score over time derived from those emotion tags, so the user can spot trends in how they feel across weeks and months.

## User Stories

- As a user, I want to capture a thought or feeling at any moment of the day so that I can review how my day went in the evening.
- As a user, I want to tag entries with an emotion so that my mood is tracked without me having to think about it separately.
- As a user, I want to link a journal entry to a habit I just completed (or missed) so I can record why or how I felt about it.
- As a user, I want to browse past days' entries so I can reflect on patterns over time.
- As a user, I want a summary view that shows my emotional state over time so I can notice trends I'd miss reading day-by-day.
- As a user, I want to see which emotions come up most frequently so I can understand my baseline mental state.

## References

| App | What it does well | Pattern used |
|-----|-------------------|--------------|
| Day One | Reverse-chronological timeline; tag chips; per-entry metadata | Card timeline, filter by tag |
| Daylio | Mood as primary data; icon-dense entry rows; Year in Pixels | Color-coded mood chips, stat-forward summary |
| Bearable | Correlation charts overlay two metrics | Dual-metric line chart |
| Reflectly | Guided entry flow; conversational prompts | Sequential sheet / wizard |

**Chosen direction:** Day One's timeline layout adapted to the existing Stride card style (white cards, gray borders, left accent bar). Daylio's stat approach for the Summary tab. Entry creation via a bottom sheet (already used elsewhere in Stride).

---

## Screens

### Daily Journal

**Purpose:** Browse and add journal entries for a specific day. The primary daily workflow — open the app, tap +, write a thought, pick an emotion, save.

**Layout (top → bottom):**
1. Sticky header — tab bar (Daily | Summary) matching the CalorieLog/HabitsPage pattern
2. Sub-header — date navigation capsule with ← Today → arrows
3. Entry count label ("4 entries")
4. Scrollable timeline — cards in chronological order (oldest at top)
5. FAB — violet, fixed bottom-right, opens Add Entry sheet

**Entry card anatomy:**
- Colored left accent bar (maps to emotion: green=Happy, purple=Anxious, teal=Motivated…)
- Top row: timestamp (e.g. "8:32 AM") + ··· menu button
- Tag row: emotion chip (emoji + label, colored) + type chip (label only, gray)
- Body text (up to ~4 lines visible, tappable to expand)
- Optional linked-item footer: "🔗 Morning Routine ✓" or "🔗 Grilled Chicken" — tappable to navigate to that item

**Add Entry sheet (bottom sheet):**
- Textarea: "What's on your mind?" placeholder, autofocus
- Emotion picker: 3×3 grid of labeled emoji buttons (tap to select, violet ring when active)
- Type tag row: horizontal scroll of pills (Thoughts / Idea / Venting / Open Loop / Reminder / Life Update / Feelings)
- Optional "Link to…" row: shows habit or calorie item if launched from one of those contexts; tappable search otherwise
- Save / Cancel buttons

**States:**
- **Empty:** Centered illustration + "Nothing here yet. Tap + to capture a thought." in gray
- **Loaded:** Timeline of entry cards
- **Loading:** Subtle skeleton cards

**Interactions:**
- Tap ← / → in date capsule → navigate to previous/next day
- Tap FAB → open Add Entry sheet (slides up)
- Tap Save → entry appears at bottom of timeline; sheet dismisses
- Tap entry card → expand/collapse body text if truncated
- Tap ··· on entry → edit / delete options
- Tap linked item badge → navigate to that habit/calorie-log day

---

### Summary

**Purpose:** Understand emotional trends over time. See how mental state evolves, which emotions appear most, and how consistent journalling has been.

**Layout (top → bottom):**
1. Same sticky tab header (Summary tab active)
2. Sub-header — range selector pill: 1M / 6M / YTD / All (matches Progress tab pattern)
3. Stats row: Days Journalled | Current Streak | Avg Entries/Day
4. "Mental State over time" card — line chart (score 1–5 derived from emotion tags)
5. "Top Emotions" card — horizontal bar chart with emoji + label + count
6. "Entry Types" card — smaller horizontal bars for type tag frequency

**Mental State Score:**
Each emotion tag maps to a numeric score:

| Emotion | Score |
|---------|-------|
| Excited | 5 |
| Happy, Motivated, Energized | 4 |
| Neutral | 3 |
| Anxious, Low | 2 |
| Sad, Frustrated, Depressed | 1 |

Days with multiple entries use the average score. Days with no journal entries show as a gap in the line (no interpolation — absence of data ≠ neutral).

**States:**
- **< 5 days data:** "Log for at least 5 days to see trends" placeholder on the chart
- **Loaded:** Charts render with realistic range
- **No data for range:** "No entries in this period" per card

**Interactions:**
- Tap range pill → charts re-render for that window
- Tap a point on the Mental State chart → shows that day's dominant emotion + a "Go to day →" link

---

## Data

**New tables needed:**

```sql
-- One entry per timestamp; multiple entries per day are normal
journal_entries (
  id            serial primary key,
  user_id       int references users(id),
  entry_date    date not null,          -- the day this belongs to
  entry_time    timestamptz not null,   -- exact timestamp
  body          text not null,
  -- Optional link to another entity
  habit_id      int references habits(id),
  calorie_item_id int references calorie_log_items(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
)

-- Many-to-many: entries can have multiple tags
journal_entry_tags (
  entry_id      int references journal_entries(id) on delete cascade,
  tag_type      journal_tag_type not null,  -- 'emotion' | 'entry_type'
  tag_value     text not null,              -- 'happy', 'anxious', 'idea', etc.
  primary key (entry_id, tag_type, tag_value)
)

-- Enum types
create type journal_tag_type as enum ('emotion', 'entry_type');
```

**Emotion tag values:** `happy`, `excited`, `motivated`, `energized`, `neutral`, `anxious`, `low`, `sad`, `frustrated`, `depressed`

**Entry type tag values:** `thoughts`, `idea`, `venting`, `open_loop`, `reminder`, `life_update`, `feelings`

**API routes (sketch):**
- `GET /api/journal?date=YYYY-MM-DD` — entries for a day
- `POST /api/journal` — create entry (body + tags + optional link)
- `PATCH /api/journal/:id` — update entry
- `DELETE /api/journal/:id`
- `GET /api/journal/summary?start=&end=` — daily scores + tag frequency for Summary view

---

## Open Questions

1. **Multiple emotions per entry?** The mockup allows one emotion tag per entry (cleaner picker UX). Should we allow multi-select (e.g. "Anxious + Excited")?
2. **Entry editing UX:** Tap card → enter edit mode inline, or always open the sheet?
3. **AI prompts (from journalling.md):** Out of scope for v1, or include a subtle "prompt of the day" in the empty state?
4. **Search:** In-scope for v1 or post-MVP? The ideas doc mentions search by tag/favorite.
5. **Habit/calorie linking from those screens:** Does tapping "Journal" on a habit open the Add Entry sheet pre-linked? Needs coordination with HabitsPage.
6. **Mental state score visibility:** Should users see the numeric score on individual entries, or only in the Summary view?
