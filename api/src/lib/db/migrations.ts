import { Inject } from "../di";
import { DB } from "./db.service";
import postgres from "postgres";
import {
  getTableMetadata,
  getPrimaryKey,
  getColumns,
  ColumnType,
  ColumnMetadata,
} from "./decorators";
import {
  Entity,
  createEntity,
  isNew,
  isDirty,
  getChanges,
  markClean,
  getEntityClass,
} from "./entity";
import { EntityStore } from "./entity-store";

type MigrationFunc = (
  migrator: Migrations,
  db: ReturnType<typeof postgres>
) => Promise<void>;

interface SchemaVersion {
  version: number;
  description: string;
  created_at: Date;
}

interface MigrationDef {
  version: number;
  description: string;
  handler: MigrationFunc;
}

export class Migrations {
  public sql: ReturnType<typeof postgres>;

  versionsMap = new Map<number, MigrationDef>();

  maxVersion = 0;

  constructor(connectionString?: string) {
    this.sql = postgres(connectionString || process.env.DATABASE_URL || "", {
      types: {
        date: {
          to: 1082,
          from: [1082],
          serialize: (x: string) => x,
          parse: (x: string) => x,
        },
      },
    });
  }

  registerMigration(
    versionNum: number,
    description: string,
    handler: MigrationFunc
  ) {
    this.versionsMap.set(versionNum, {
      version: versionNum,
      description,
      handler,
    });

    this.maxVersion = Math.max(this.maxVersion, versionNum);
  }

  async migrateCreateEntity(entity: any) {
    const tableMetadata = EntityStore.get(entity);
    if (!tableMetadata) {
      throw new Error(`table metadata not found!`);
    }

    const tableName = tableMetadata.tableName;
    const columns = getColumns(tableMetadata.classObj);

    // Create enum types first
    for (const col of columns) {
      if (col.type === ColumnType.Enum && col.enum) {
        await this.createEnumType(tableName, col);
      }
    }

    // Create table
    let sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;

    let firstCol = true;

    for (const col of columns) {
      if (!firstCol) {
        sql += ",\n";
      }

      sql += this.getColumnSql(tableName, col);

      firstCol = false;
    }

    sql += "\n);";

    console.log(`Migrate ${tableName} sql =\n ${sql}`);

    await this.sql.unsafe(sql);
  }

  private async createEnumType(tableName: string, col: ColumnMetadata) {
    const enumName = `${tableName}_${col.columnName}_enum`;
    const enumValues = Object.values(col.enum).filter(
      (v) => typeof v === "string"
    );
    const valuesList = enumValues.map((v) => `'${v}'`).join(", ");

    const sql = `CREATE TYPE "${enumName}" AS ENUM (${valuesList})`;

    console.log(`Create enum SQL = ${sql}`);

    await this.sql.unsafe(sql);
  }

  private getColumnSql(tableName: string, col: ColumnMetadata) {
    let sql = `${col.columnName} `;

    if (col.primary) {
      sql += `SERIAL PRIMARY KEY`;
    } else {
      switch (col.type) {
        case ColumnType.Number:
          sql += "INT";
          break;
        case ColumnType.String:
          const maxLength = col.maxLength;
          if (maxLength) {
            sql += `VARCHAR(${maxLength})`;
          } else {
            sql += "TEXT";
          }
          break;
        case ColumnType.Enum:
          if (col.enum) {
            const enumName = `${tableName}_${col.columnName}_enum`;
            sql += `"${enumName}"`;
          } else {
            throw new Error(
              `Enum column ${col.columnName} must have enum option specified`
            );
          }
          break;
        case ColumnType.Timestamp:
          sql += "TIMESTAMPTZ";
          break;
        case ColumnType.Date:
          sql += "DATE";
          break;
      }
    }

    if (!col.optional) {
      sql += " NOT NULL";
    }
    return sql;
  }

  async addColumn(entity: any, property: string) {
    const tableMetadata = EntityStore.get(entity);
    if (!tableMetadata) {
      throw new Error(`table metadata not found!`);
    }

    const tableName = tableMetadata.tableName;
    const columns = getColumns(tableMetadata.classObj);
    const column = columns.find((col) => col.propertyKey === property);
    if (!column) {
      throw new Error(
        `Cannot add column ${property} to ${tableName} as it doesn't exist!`
      );
    }

    // Create enum type if needed
    if (column.type === ColumnType.Enum && column.enum) {
      await this.createEnumType(tableName, column);
    }

    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${this.getColumnSql(
      tableName,
      column
    )}`;

    console.log(`Add column SQL = ${sql}`);

    await this.sql.unsafe(sql);
  }

  async run() {
    await this.createVersionsTableIfNotExists();

    const versionsResult = await this.sql.unsafe<SchemaVersion[]>(
      "SELECT * FROM schema_versions ORDER BY version DESC LIMIT 1"
    );

    const lastVersion = versionsResult.length > 0 ? versionsResult[0] : null;

    const currentVersionNum = lastVersion?.version ?? 0;

    console.log(`On DB Schema version ${currentVersionNum}`);

    if (currentVersionNum < this.maxVersion) {
      console.log(
        `Schema Version ${this.maxVersion} is registered, beginning migrations...`
      );

      for (
        let migrationVersionNum = currentVersionNum + 1;
        migrationVersionNum <= this.maxVersion;
        migrationVersionNum++
      ) {
        const migrationDef = this.versionsMap.get(migrationVersionNum);
        if (!migrationDef) {
          throw new Error(`Migration ${migrationVersionNum} not found!`);
        }

        console.log(
          `Running migration ${migrationVersionNum}-${migrationDef.description}...`
        );

        await migrationDef.handler(this, this.sql);

        await this.sql.unsafe(
          "INSERT INTO schema_versions (version, description) VALUES ($1, $2);",
          [migrationVersionNum, migrationDef.description]
        );

        console.log(
          `Migration ${migrationVersionNum}-${migrationDef.description} done...`
        );
      }
    }

    // const entityMetadatas = EntityStore.getAll();
    // for (const entityMetadata of entityMetadatas) {
    //   console.log(`Entity Migration started for ${entityMetadata.tableName}`);
    //   const columns = getTableMetadata(entityMetadata.classObj);
    //   if (columns.length == 0) {
    //     console.log(`No columns found for ${entityMetadata.tableName}`);
    //     continue;
    //   }
    // }
  }

  protected async createVersionsTableIfNotExists() {
    const versionsExists = await this.tableExists("schema_versions");

    if (!versionsExists) {
      let sql = `
        CREATE TABLE IF NOT EXISTS "schema_versions" (
          "version" INT PRIMARY KEY,
          "description" VARCHAR(255) NOT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT current_timestamp
        );
      `;

      console.log(`VERSIONS SQL: \n${sql}`);

      await this.sql.unsafe(sql);

      console.log(`Versions table created`);
    }
  }

  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.sql.unsafe<{ exists: boolean }[]>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [`public.${tableName}`]
    );
    return result[0]?.exists ?? false;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
