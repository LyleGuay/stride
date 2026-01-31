import postgres from "postgres";

export interface DbColumnInfo {
  columnName: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  characterMaxLength: number | null;
  columnDefault: string | null;
}

export interface DbTableInfo {
  tableName: string;
  columns: DbColumnInfo[];
}

export interface DbEnumInfo {
  typeName: string;
  enumValues: string[];
}

export interface DbSchema {
  tables: DbTableInfo[];
  enums: DbEnumInfo[];
}

export class SchemaIntrospector {
  constructor(private sql: ReturnType<typeof postgres>) {}

  async getSchema(): Promise<DbSchema> {
    const tables = await this.getTables();
    const enums = await this.getEnumTypes();
    return { tables, enums };
  }

  private async getTables(): Promise<DbTableInfo[]> {
    const tableNames = await this.sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name != 'schema_versions'
    `;

    const tables: DbTableInfo[] = [];

    for (const { table_name } of tableNames) {
      const columns = await this.getColumnsForTable(table_name);
      tables.push({ tableName: table_name, columns });
    }

    return tables;
  }

  private async getColumnsForTable(tableName: string): Promise<DbColumnInfo[]> {
    const rows = await this.sql<
      {
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        character_maximum_length: number | null;
        column_default: string | null;
      }[]
    >`
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        character_maximum_length,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `;

    return rows.map((row) => ({
      columnName: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      isNullable: row.is_nullable === "YES",
      characterMaxLength: row.character_maximum_length,
      columnDefault: row.column_default,
    }));
  }

  async getEnumTypes(): Promise<DbEnumInfo[]> {
    const rows = await this.sql<{ typname: string; enumlabel: string }[]>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      ORDER BY t.typname, e.enumsortorder
    `;

    const enumMap = new Map<string, string[]>();
    for (const { typname, enumlabel } of rows) {
      if (!enumMap.has(typname)) {
        enumMap.set(typname, []);
      }
      enumMap.get(typname)!.push(enumlabel);
    }

    return Array.from(enumMap.entries()).map(([typeName, enumValues]) => ({
      typeName,
      enumValues,
    }));
  }

  async getNextMigrationVersion(): Promise<number> {
    // Check if schema_versions table exists
    const tableExists = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'schema_versions'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      return 1;
    }

    const result = await this.sql<{ version: number }[]>`
      SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1
    `;
    return result.length > 0 ? result[0].version + 1 : 1;
  }
}
