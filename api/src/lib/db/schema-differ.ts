import { ColumnMetadata, ColumnType, getColumns } from "./decorators";
import { DbColumnInfo, DbSchema, DbTableInfo } from "./schema-introspector";
import { TableMetadata } from "./decorators";

export type DiffOperation =
  | { type: "CREATE_TABLE"; entity: any; tableName: string }
  | {
      type: "ADD_COLUMN";
      entity: any;
      tableName: string;
      columnName: string;
      propertyKey: string;
    }
  | { type: "DROP_COLUMN"; tableName: string; columnName: string }
  | {
      type: "ALTER_COLUMN";
      entity: any;
      tableName: string;
      columnName: string;
      propertyKey: string;
      changes: ColumnChanges;
    };

export interface ColumnChanges {
  typeChanged?: boolean;
  nullabilityChanged?: boolean;
  maxLengthChanged?: boolean;
  oldType?: string;
  newType?: string;
}

export class SchemaDiffer {
  computeDiff(
    entities: TableMetadata[],
    dbSchema: DbSchema
  ): DiffOperation[] {
    const diffs: DiffOperation[] = [];

    const dbTableMap = new Map<string, DbTableInfo>();
    for (const table of dbSchema.tables) {
      dbTableMap.set(table.tableName, table);
    }

    for (const entityMeta of entities) {
      const tableName = entityMeta.tableName;
      const dbTable = dbTableMap.get(tableName);

      if (!dbTable) {
        // Table doesn't exist in DB
        diffs.push({
          type: "CREATE_TABLE",
          entity: entityMeta.classObj,
          tableName,
        });
      } else {
        // Table exists, compare columns
        const columnDiffs = this.compareColumns(
          entityMeta.classObj,
          tableName,
          dbTable
        );
        diffs.push(...columnDiffs);
      }
    }

    // Check for tables in DB that are not in entities (orphaned tables)
    // We don't generate DROP TABLE operations by default - too risky

    return diffs;
  }

  private compareColumns(
    entity: any,
    tableName: string,
    dbTable: DbTableInfo
  ): DiffOperation[] {
    const diffs: DiffOperation[] = [];
    const entityColumns = getColumns(entity);

    const dbColumnMap = new Map<string, DbColumnInfo>();
    for (const col of dbTable.columns) {
      dbColumnMap.set(col.columnName, col);
    }

    const entityColumnNames = new Set<string>();

    // Check each entity column
    for (const entityCol of entityColumns) {
      entityColumnNames.add(entityCol.columnName);
      const dbCol = dbColumnMap.get(entityCol.columnName);

      if (!dbCol) {
        // Column doesn't exist in DB
        diffs.push({
          type: "ADD_COLUMN",
          entity,
          tableName,
          columnName: entityCol.columnName,
          propertyKey: entityCol.propertyKey,
        });
      } else {
        // Column exists, check for type mismatches
        const changes = this.compareColumnTypes(entityCol, dbCol, tableName);
        if (changes) {
          diffs.push({
            type: "ALTER_COLUMN",
            entity,
            tableName,
            columnName: entityCol.columnName,
            propertyKey: entityCol.propertyKey,
            changes,
          });
        }
      }
    }

    // Check for columns in DB that are not in entity
    for (const dbCol of dbTable.columns) {
      if (!entityColumnNames.has(dbCol.columnName)) {
        diffs.push({
          type: "DROP_COLUMN",
          tableName,
          columnName: dbCol.columnName,
        });
      }
    }

    return diffs;
  }

  private compareColumnTypes(
    entityCol: ColumnMetadata,
    dbCol: DbColumnInfo,
    tableName: string
  ): ColumnChanges | null {
    const changes: ColumnChanges = {};
    let hasChanges = false;

    // Check type match
    if (!this.typesMatch(entityCol, dbCol, tableName)) {
      changes.typeChanged = true;
      changes.oldType = dbCol.dataType;
      changes.newType = this.getExpectedPostgresType(entityCol, tableName);
      hasChanges = true;
    }

    // Check nullability (only for non-primary columns)
    if (!entityCol.primary) {
      const entityNullable = entityCol.optional;
      const dbNullable = dbCol.isNullable;
      if (entityNullable !== dbNullable) {
        changes.nullabilityChanged = true;
        hasChanges = true;
      }
    }

    // Check maxLength for string columns
    if (entityCol.type === ColumnType.String && entityCol.maxLength) {
      if (dbCol.characterMaxLength !== entityCol.maxLength) {
        changes.maxLengthChanged = true;
        hasChanges = true;
      }
    }

    return hasChanges ? changes : null;
  }

  private typesMatch(
    entityCol: ColumnMetadata,
    dbCol: DbColumnInfo,
    tableName: string
  ): boolean {
    // Handle primary key (SERIAL)
    if (entityCol.primary) {
      return (
        dbCol.dataType === "integer" &&
        dbCol.columnDefault !== null &&
        dbCol.columnDefault.includes("nextval")
      );
    }

    switch (entityCol.type) {
      case ColumnType.Number:
        return dbCol.dataType === "integer";

      case ColumnType.String:
        if (entityCol.maxLength) {
          return dbCol.dataType === "character varying";
          // Note: maxLength check is separate
        }
        return dbCol.dataType === "text";

      case ColumnType.Enum:
        const expectedEnumName = `${tableName}_${entityCol.columnName}_enum`;
        return (
          dbCol.dataType === "USER-DEFINED" && dbCol.udtName === expectedEnumName
        );

      case ColumnType.Timestamp:
        return dbCol.dataType === "timestamp with time zone";

      case ColumnType.Date:
        return dbCol.dataType === "date";

      default:
        return false;
    }
  }

  private getExpectedPostgresType(
    entityCol: ColumnMetadata,
    tableName: string
  ): string {
    if (entityCol.primary) {
      return "SERIAL PRIMARY KEY";
    }

    switch (entityCol.type) {
      case ColumnType.Number:
        return "INT";
      case ColumnType.String:
        return entityCol.maxLength
          ? `VARCHAR(${entityCol.maxLength})`
          : "TEXT";
      case ColumnType.Enum:
        return `${tableName}_${entityCol.columnName}_enum`;
      case ColumnType.Timestamp:
        return "TIMESTAMPTZ";
      case ColumnType.Date:
        return "DATE";
      default:
        return "UNKNOWN";
    }
  }
}
