
User can create recipes with assistance of AI. The goal is to make creating and executing recipes very easy and avoid anxiety around these.

User can add:
- Notes: Important notes before starting.
- Ingredients. With name, quantity/quantity UOM and optional note.
- Tools needed for the recipe -- spoons, oven, etc...
- Instructions. Each instruction would be a a paragraph of text. Each instruction can reference ingredients/tools previously defined.
- Delays can be defined between steps for waiting. A timer can also have a corresponding text. A timer can have 2 modes: pre-step or post-step. Depending on when the timing should be done.
- (Nice to have): Would be nice to have "continue" steps (lack of better term) where a step can happen during a timer -- for steps that should happen while your waiting on something else.

User can enter "Execution Mode":
- Marking steps as done
- Starting timers
- Keep phone on.

- Recipes can be used to aid in logging calories. There would be an option when logging calories to choose from a recipe and choose servings (calories and macros would be proportional to entered serving)

Example Recipe:
Pumpkin Pie
[Dessert]

# Ingredients
- Pumpkin Puree - 1 can
- cinnamon - 1 tbsp
- pie crust - 1 each
etc...

# Instructions
1. Preheat oven to 420 C
2. Put Pie crust on baking sheet, Leave in oven for 5 minutes (Timer Step, Post 5 minutes).
    3. (Continuation Step) While that happens, in a bowl mix the pumpkin puree, cinamon, etc..
4. Once  pie crust is done, remove from oven, etc...
5. Put pie with filling back in oven, leave for 20 minutes (Timer Step, Post 20 minutes)

When entering a calorie log item from recipe, the user selects the recipe and enters the quantity. It would scale similar to how favorites currently works for calorie log items. In fact, we could likely use favorites menu to add recipe based calorie log items (add filter for only recipes).

When an item is added by recipe, it should store the recipe id. That way we could also show the ingredient contributing to the calorie result.

AI will be used for:
- Enter text prompt, AI generates a complete recipe.
- Take a recipe and modify it using AI prompt.
- Take a recipe and modify it usign AI prompt and create a copy.