# Database Migrations

This project includes a migration generator that compares your ORM entity definitions against the actual PostgreSQL database schema and generates SQL migration files.

## Quick Start

```bash
# Preview changes (no file written)
npm run migration:generate

# Generate migration file with custom name
npm run migration:generate -- my-migration-name --write

# Generate migration file with auto-generated name
npm run migration:generate -- --write
```

## Output

Migration files are written to `src/migrations/` with the format:
```
YYYY-MM-DD-migration-name.sql
```

Example: `2026-01-21-add-users-table.sql`

## Entity Decorators

### @Table

Marks a class as a database table.

```typescript
@Table('users')
export class User {
  // ...
}
```

### @Column

Defines a column on the table.

```typescript
@Column(columnName: string, type: ColumnType, options?: ColumnOptions)
```

**Column Types:**
- `ColumnType.Number` - `INT` (or `SERIAL` if primary)
- `ColumnType.String` - `TEXT` or `VARCHAR(n)` if `maxLength` specified
- `ColumnType.Enum` - PostgreSQL enum type
- `ColumnType.Timestamp` - `TIMESTAMPTZ`
- `ColumnType.Date` - `DATE`

**Options:**
- `primary?: boolean` - Makes column a `SERIAL PRIMARY KEY`
- `optional?: boolean` - Allows `NULL` values
- `maxLength?: number` - For strings, creates `VARCHAR(n)` instead of `TEXT`
- `enum?: object` - TypeScript enum for enum columns

**Example:**

```typescript
@Table('users')
export class User {
  @Column("id", ColumnType.Number, { primary: true })
  id: number;

  @Column("username", ColumnType.String, { maxLength: 255 })
  username: string;

  @Column("bio", ColumnType.String, { optional: true })
  bio?: string;

  @Column("created_at", ColumnType.Timestamp)
  createdAt: Date;
}
```

### @ForeignKey

Defines a foreign key constraint on a column.

```typescript
@ForeignKey(referencedTable: string, referencedColumn: string, options?: ForeignKeyOptions)
```

**Options:**
- `onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION"`

**Example:**

```typescript
@Table('habits')
export class Habit {
  @Column("id", ColumnType.Number, { primary: true })
  id: number;

  @Column("user_id", ColumnType.Number)
  @ForeignKey("users", "id", { onDelete: "CASCADE" })
  userId: number;
}
```

### Enum Columns

```typescript
enum HabitCadence {
  daily = 'daily',
  weekly = 'weekly'
}

@Table('habits')
export class Habit {
  @Column('cadence', ColumnType.Enum, { enum: HabitCadence })
  cadence: HabitCadence;
}
```

This generates:
```sql
CREATE TYPE "habits_cadence_enum" AS ENUM ('daily', 'weekly');
```

## Registering Entities

All entities must be registered in `src/entities/index.ts`:

```typescript
import { EntityStore } from "../lib/db";
import { User } from "./user.entity";
import { Habit } from "./habit.entity";

export * from "./user.entity";
export * from "./habit.entity";

export function registerEntities() {
  EntityStore.register(User);
  EntityStore.register(Habit);
}
```

## What Gets Detected

The migration generator detects:

| Change | Status |
|--------|--------|
| New tables | Generates `CREATE TABLE` |
| New columns | Generates `ALTER TABLE ADD COLUMN` |
| Removed columns | Generates `ALTER TABLE DROP COLUMN` (with warning) |
| Type changes | Detected, requires manual migration |
| Foreign keys | Included in table creation or as `ADD CONSTRAINT` |

## Generated SQL Example

```sql
-- Migration: 1
-- Description: Create users, habits tables
-- Generated: 2026-01-21T12:00:00.000Z

CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "username" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL
);

CREATE TYPE "habits_cadence_enum" AS ENUM ('daily', 'weekly');
CREATE TABLE "habits" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "cadence" "habits_cadence_enum" NOT NULL,
  "user_id" INT NOT NULL,
  CONSTRAINT "fk_habits_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
```
