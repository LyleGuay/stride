# AI Dinner Suggestions

## Problem

Dinner is a weak spot — ordering tends to escalate (larger entree, sides, dessert). By dinner time, decision fatigue and hunger make it hard to stay intentional. A smart suggestion removes the guesswork and keeps dinner right-sized for what's left in the calorie budget.

## Core Concept

The AI looks at what you've already eaten today, calculates remaining calories, and suggests 2-3 dinner options that fit within budget. You get a concrete plan before you're staring at a menu hungry.

## V1 — Simple Suggestion

- "Suggest Dinner" button on the daily calorie log view
- Sends remaining calorie budget + today's logged items to an LLM (Claude API)
- Returns 2-3 meal ideas with estimated calories
- No restaurant integration, no history — just a smart suggestion based on today's numbers

### Example Flow

1. You've logged 1,400 cal across breakfast and lunch, daily target is 2,200
2. Tap "Suggest Dinner" — AI sees 800 cal remaining
3. AI suggests:
   - Grilled salmon with roasted vegetables (~650 cal)
   - Chicken stir-fry with rice (~720 cal)
   - Turkey burger with side salad (~580 cal)
4. You pick one (or don't) and go order/cook

### Implementation

- One new API endpoint that assembles a prompt from today's log data and calls the Claude API
- Prompt includes: remaining calories, today's logged items, any user preferences
- Response: 2-3 suggestions with name, brief description, estimated calories
- LLM call is cheap (fractions of a cent with Haiku)
- No training or fine-tuning needed — just prompt engineering

## Future Iterations

- **Restaurant mode:** "I'm ordering from [restaurant]" — suggests a specific order within budget (e.g., "Chipotle: chicken bowl, no rice, extra beans — 640 cal")
- **Saved restaurants/meals:** Suggestions draw from places you actually order from
- **History-aware:** Uses past log data for personalization ("you've been low on protein this week, here's a high-protein option")
- **Weekly patterns:** Learns habits ("you order Thai on Fridays") and leans into or away from them
- **Meal prep suggestions:** If you're cooking, suggest recipes not just meals
- **Dinner budget:** Pair with a dedicated dinner calorie sub-budget for tighter control
- **Daily reminder:** Push notification at ~5pm: "Dinner planning time — want a suggestion?"
