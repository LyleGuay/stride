# Calorie & Macro AI Suggestions

## Overview

When the user types a food description into the name field (in either the inline add row or the Add Item bottom sheet), the app automatically fetches an AI suggestion after a brief typing pause (debounce). A **suggestion strip** appears below the input — not inside it — showing the parsed result. The user reviews it, then taps the sparkle button on the strip to apply the values to the fields. Nothing is overwritten until they explicitly accept.

Example: typing "5 small chocolate chip cookies" → suggestion strip appears:
> ✦ Small Chocolate Chip Cookies · 5 × Each · 185 cal · 2g P · 25g C · 9g F  [Apply]

Tapping Apply fills all fields.

## User Stories

- As a user, I want to type a natural food description and see a calorie/macro suggestion appear automatically so I can accept it with one tap.
- As a user, I want to see the suggestion before it overwrites my input so I can reject it if it looks wrong.
- As a user, I want to edit any auto-filled value after applying if it doesn't look right.
- As a user, I want the suggestion to work in both the quick inline add and the full bottom sheet form.

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| MyFitnessPal | Natural language voice logging, large food database | Inline search with NLP, suggestions list |
| Calorik | "Tell me what you ate" → instant macro analysis | Full-sentence input, AI parses everything |
| Cronometer | Exact nutritional data from USDA/verified databases | Type-ahead search, select from results |
| Lose It! | Snap-to-log, AI meal analysis | Camera button + text fallback |

## AI Service Recommendation

**Use GPT-4o-mini (OpenAI)**

- Cost: ~$0.001 per lookup — negligible for a personal app
- Handles any free-form description including custom items, brand names, and vague portions
- Returns structured JSON when prompted with a schema
- Fast: typically < 2 seconds
- No food database subscription needed

**Why not the alternatives:**
- **Nutritionix**: Starts at $299/month — overkill for a personal tool. Great accuracy for recognized foods, but can't handle custom descriptions.
- **Edamam**: $19/month, decent NLP, but struggles with vague portion descriptions.
- **USDA FoodData Central**: Free and accurate but requires exact food names — no NLP.

**Recommended prompt strategy**: System prompt: "You are a nutrition assistant. Parse the food description and return a JSON object with: `item_name` (string, cleaned up title case), `qty` (number), `uom` (one of: each, g, miles, km, minutes), `calories` (integer), `protein_g` (integer), `carbs_g` (integer), `fat_g` (integer). If you cannot confidently determine the calories for this food, return `{ "error": "unrecognized" }` instead. Return only valid JSON, no explanation."

**Backend**: New endpoint `POST /api/calorie-log/suggest` that accepts `{ description: string }` and returns the parsed nutrition JSON or an error. The Go handler calls the OpenAI API with the structured prompt. The `OPENAI_API_KEY` env var is added to `go-api/.env`.

## Screens

### Suggestion Flow — Inline Add Row

**Purpose:** Let users get nutrition data without leaving the inline add form.

**Layout:**

The inline add row is unchanged. A **suggestion row** appears directly below it — a second table row spanning all columns, lightly tinted blue-indigo. It shows the parsed result and an Apply button.

```
Input row (existing):
[ 5 small chocolate chip cookies ] [ 1 ] [Each] [    ] [  ] [  ] [  ]  [Add] [✕]

Suggestion row (new, appears below):
  ✦  Small Chocolate Chip Cookies · 5 × Each · 185 cal · 2g P · 25g C · 9g F    [Apply] [✕]
```

**Behavior:**
1. User types in the name field — nothing happens immediately
2. After a 600ms pause (debounce), an AI request fires in the background
3. While fetching: a subtle loading indicator appears on the left of the suggestion row (spinner or pulsing dots) — the row is already visible in skeleton form so layout doesn't jump
4. Suggestion arrives: row shows the parsed food name, qty, uom, calories, macros
5. User taps **Apply** (sparkle button): all inline add fields populate, suggestion row disappears, field flash green briefly
6. User can then adjust any field before hitting Add
7. User taps ✕ on the suggestion row: row dismisses, fields untouched

**States:**
- **No text / < 2 chars**: Suggestion row not shown
- **Typing (debounce pending)**: Suggestion row may appear in a subtle "waiting..." skeleton state, or simply not appear yet (both acceptable)
- **Loading**: Suggestion row visible, shows spinner + muted placeholder text ("Looking up nutrition...")
- **Suggestion ready**: Row shows parsed values + Apply button + dismiss ✕
- **Unrecognized food**: Row shows a warning: "⚠ Couldn't determine nutrition for this item — enter manually." No Apply button. Dismiss with ✕.
- **API error**: Row dismissed; toast notification appears: "Suggestion failed — please try again."
- **Applied**: Row disappears, fields flash green

### Suggestion Flow — Add Item Bottom Sheet

**Purpose:** Same suggestion pattern in the full form. More visual space allows a slightly richer suggestion card.

**Layout:**

The suggestion appears as a card directly below the name input field:

```
Item name
[ 5 small chocolate chip cookies                              ]
┌────────────────────────────────────────────────────────────┐
│  ✦  Small Chocolate Chip Cookies                           │
│     5 × Each · 185 cal · 2g P · 25g C · 9g F    [Apply]  │
└────────────────────────────────────────────────────────────┘
```

For unrecognized food:
```
┌────────────────────────────────────────────────────────────┐
│  ⚠  Couldn't determine nutrition for this item.            │
│     Try being more specific (e.g. "medium apple").         │
└────────────────────────────────────────────────────────────┘
```

**States:** Same as inline. Toast for API errors. Inline warning for unrecognized food.

### Interactions

- User types in name field (either context) → debounce 600ms → AI request fires
- Suggestion row/card appears (with loading state while request is in flight)
- User taps **Apply** (✦ button on suggestion) → fields populate, suggestion dismisses, green flash
- User taps ✕ on suggestion → suggestion dismisses, fields unchanged
- User clears the name field → suggestion hides
- AI returns unrecognized → warning shown inline, no Apply button
- API/network error → toast "Suggestion failed — please try again", suggestion row clears

## API

**New endpoint:** `POST /api/calorie-log/suggest`

Request:
```json
{ "description": "5 small chocolate chip cookies" }
```

Success response:
```json
{
  "item_name": "Small Chocolate Chip Cookies",
  "qty": 5,
  "uom": "each",
  "calories": 185,
  "protein_g": 2,
  "carbs_g": 25,
  "fat_g": 9
}
```

Unrecognized food response (`HTTP 200`, handled as inline warning, not toast):
```json
{ "error": "unrecognized" }
```

API/server error (`HTTP 500`, shown as toast):
```json
{ "error": "openai request failed" }
```

The Go handler calls OpenAI's chat completions API with the structured prompt. The `OPENAI_API_KEY` env var is added to `go-api/.env`.

## Data

No new DB tables needed. The suggestion endpoint is stateless — it returns values the user then submits via the existing create-item flow.

## Open Questions

- Should the debounce be 600ms or shorter? Shorter (400ms) feels more responsive but fires more requests.
- Should we cache suggestions by description? If the user types "banana" twice, serve the cached response instead of calling OpenAI again. A simple in-memory map on the Go side per-process would work.
- Should the parsed `item_name` overwrite the name field on Apply, or leave the name field alone and only fill in the numeric fields? Overwriting with the cleaned-up title-cased name is cleaner but may feel presumptuous if the user typed a very specific informal name they wanted to keep.
