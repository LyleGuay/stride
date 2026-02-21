# Exercise Offset Suggestions

## Problem

Calorie numbers are abstract. Going 300 calories over budget doesn't feel like much until you realize that's a 35-minute jog. Translating excess calories into exercise time makes the cost concrete and actionable — you can either skip the extra food or go burn it off.

## Core Concept

When you exceed your calorie budget (daily or per-meal), the app shows how much exercise it would take to offset the overage. Multiple exercise types with different time estimates (walking is easy but takes longer, running is faster but harder).

## When to Show It

### Over a category budget (breakfast, lunch, dinner)
You set a 500 cal breakfast budget and log 600 cal. The app immediately shows:
- 25 min walking
- 12 min jogging
- 10 min cycling

This catches overspending early in the day — you can adjust lunch/dinner or go for a walk.

### Pre-log warning
About to log an item that pushes you over budget. Before confirming:
- "This puts you 200 cal over your dinner budget"
- ~20 min walking / ~12 min jogging / ~8 min cycling

### Meal browsing / lookup
When browsing meal ideas, items that exceed the remaining budget show the exercise cost of the overage alongside the calorie count.

### End of day summary
Daily total exceeded target. Summary shows the full overage translated to exercise options.

## Example

> **Breakfast budget: 500 cal — You logged 620 cal (+120 cal)**
>
> To offset:
> - 25 min walking
> - 12 min jogging
> - 10 min cycling

## Implementation Considerations

- Exercise burn rates can start as static estimates based on body weight averages (e.g., walking ~4 cal/min, jogging ~10 cal/min, cycling ~8 cal/min)
- Could personalize with user weight if available
- Fitbit integration (see [ideas.md](ideas.md)) would replace estimates with actual burn rate data
- UI: subtle inline display, not a modal/blocker — informative, not punishing

## Future Iterations

- **Fitbit/wearable integration:** Use real calorie burn data instead of generic estimates
- **Custom exercise types:** User adds their own activities (swimming, weight training, etc.)
- **Exercise logging:** Actually log the offset exercise and reconcile the daily budget
- **Weekly view:** "You went over by 1,200 cal this week — that's about 2.5 hours of walking"
