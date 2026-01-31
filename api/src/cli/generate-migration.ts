import "dotenv/config";
import "reflect-metadata";
import { EntityStore } from "../lib/db/entity-store";
import { Migrations } from "../lib/db/migrations";
import { SchemaIntrospector } from "../lib/db/schema-introspector";
import { SchemaDiffer } from "../lib/db/schema-differ";
import { MigrationGenerator } from "../lib/db/migration-generator";
import { registerEntities } from "../entities";

registerEntities();

function parseArgs(): { name?: string; write: boolean } {
  const args = process.argv.slice(2);
  let name: string | undefined;
  const write = args.includes("--write");

  for (const arg of args) {
    if (!arg.startsWith("--")) {
      name = arg;
      break;
    }
  }

  return { name, write };
}

function getDatePrefix(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

async function main() {
  const { name, write } = parseArgs();
  const migrations = new Migrations();

  try {
    const introspector = new SchemaIntrospector(migrations.sql);
    const differ = new SchemaDiffer();
    const generator = new MigrationGenerator();

    // Get current DB schema
    console.log("Fetching database schema...");
    const dbSchema = await introspector.getSchema();

    console.log(
      `Found ${dbSchema.tables.length} table(s) in database:`,
      dbSchema.tables.map((t) => t.tableName).join(", ") || "(none)"
    );

    // Get entity definitions
    const entities = EntityStore.getAll();
    console.log(
      `Found ${entities.length} entity(ies) in code:`,
      entities.map((e) => e.tableName).join(", ")
    );

    // Compute diff
    const diffs = differ.computeDiff(entities, dbSchema);

    if (diffs.length === 0) {
      console.log("\nNo schema changes detected. Database is in sync with entities.");
      return;
    }

    console.log(`\nDetected ${diffs.length} change(s):`);
    for (const diff of diffs) {
      switch (diff.type) {
        case "CREATE_TABLE":
          console.log(`  - CREATE TABLE: ${diff.tableName}`);
          break;
        case "ADD_COLUMN":
          console.log(`  - ADD COLUMN: ${diff.tableName}.${diff.columnName}`);
          break;
        case "DROP_COLUMN":
          console.log(`  - DROP COLUMN: ${diff.tableName}.${diff.columnName}`);
          break;
        case "ALTER_COLUMN":
          console.log(`  - ALTER COLUMN: ${diff.tableName}.${diff.columnName}`);
          break;
      }
    }

    // Get next version number
    const nextVersion = await introspector.getNextMigrationVersion();

    // Generate migration code
    const migration = generator.generate(diffs, nextVersion);

    console.log("\n" + "=".repeat(60));
    console.log("Generated SQL");
    console.log("=".repeat(60) + "\n");
    console.log(migration.sql);
    console.log("\n" + "=".repeat(60));

    // Write to file if requested
    if (write) {
      const fs = await import("fs/promises");
      const path = await import("path");

      // Use provided name or auto-generate from description
      const migrationName = name || toKebabCase(migration.description);
      const filename = `${getDatePrefix()}-${migrationName}.sql`;
      const filepath = path.join(__dirname, "..", "migrations", filename);

      // Ensure migrations directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await fs.writeFile(filepath, migration.sql);

      console.log(`\nWritten to: ${filepath}`);
    } else {
      console.log("\nTip: Run with --write to save to a file");
      console.log("Usage: npm run migration:generate [name] [--write]");
    }
  } finally {
    await migrations.close();
  }
}

main().catch((err) => {
  console.error("Error generating migration:", err);
  process.exit(1);
});
