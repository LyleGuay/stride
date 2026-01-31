import { EntityStore } from "../lib/db";
import { User } from "./user.entity";
import { Habit } from "./habit.entity";

export * from "./user.entity";
export * from "./habit.entity";

export function registerEntities() {
  EntityStore.register(User);
  EntityStore.register(Habit);
}
