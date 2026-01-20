const ORIGINAL_VALUES = Symbol("entity:original");
const DIRTY_FIELDS = Symbol("entity:dirty");
const IS_NEW = Symbol("entity:isNew");
const ENTITY_CLASS = Symbol("entity:class");

export interface Entity {
  [ORIGINAL_VALUES]: Record<string, unknown>;
  [DIRTY_FIELDS]: Set<string>;
  [IS_NEW]: boolean;
  [ENTITY_CLASS]: any;
}

export function createEntity<T extends object>(
  entity: T,
  entityClass: any,
  isNew: boolean
): T & Entity {
  const original = isNew ? {} : { ...entity };
  const dirty = new Set<string>();

  const tracked = entity as T & Entity;
  tracked[ORIGINAL_VALUES] = original as Record<string, unknown>;
  tracked[DIRTY_FIELDS] = dirty;
  tracked[IS_NEW] = isNew;
  tracked[ENTITY_CLASS] = entityClass;

  return new Proxy(tracked, {
    set(target, prop, value) {
      if (typeof prop === "string") {
        const originalValue = (original as any)[prop];

        if (value !== originalValue) {
          dirty.add(prop);
        } else {
          dirty.delete(prop);
        }
      }

      return Reflect.set(target, prop, value);
    },
  });
}

export function isNew(entity: Entity): boolean {
  return entity[IS_NEW];
}

export function isDirty(entity: Entity): boolean {
  return entity[DIRTY_FIELDS].size > 0;
}

export function getChanges<T extends Entity>(entity: T): Partial<T> {
  const changes: Partial<T> = {};

  for (const field of entity[DIRTY_FIELDS]) {
    changes[field as keyof T] = entity[field as keyof T];
  }

  return changes;
}

export function markClean(entity: Entity): void {
  entity[ORIGINAL_VALUES] = { ...entity };
  entity[DIRTY_FIELDS].clear();
  (entity as any)[IS_NEW] = false;
}

export function getEntityClass(entity: Entity): any {
  return entity[ENTITY_CLASS];
}
