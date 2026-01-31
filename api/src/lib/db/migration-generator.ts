import { DiffOperation } from "./schema-differ";
import { EntityStore } from "./entity-store";
import {
  getColumns,
  ColumnType,
  ColumnMetadata,
  getForeignKeys,
  ForeignKeyMetadata,
} from "./decorators";

export interface GeneratedMigration {
  version: number;
  description: string;
  sql: string;
}

export class MigrationGenerator {
  generate(diffs: DiffOperation[], version: number): GeneratedMigration {
    const statements: string[] = [];

    for (const diff of diffs) {
      switch (diff.type) {
        case "CREATE_TABLE":
          statements.push(...this.generateCreateTable(diff.entity, diff.tableName));
          break;

        case "ADD_COLUMN":
          statements.push(
            ...this.generateAddColumn(diff.entity, diff.tableName, diff.propertyKey)
          );
          break;

        case "DROP_COLUMN":
          statements.push(`-- WARNING: Dropping column - verify this is intentional!`);
          statements.push(
            `ALTER TABLE "${diff.tableName}" DROP COLUMN "${diff.columnName}";`
          );
          break;

        case "ALTER_COLUMN":
          statements.push(
            `-- WARNING: Column "${diff.columnName}" type change detected - manual review required`
          );
          if (diff.changes.typeChanged) {
            statements.push(
              `-- Type changed from "${diff.changes.oldType}" to "${diff.changes.newType}"`
            );
          }
          if (diff.changes.nullabilityChanged) {
            statements.push(`-- Nullability changed`);
          }
          if (diff.changes.maxLengthChanged) {
            statements.push(`-- Max length changed`);
          }
          statements.push(`-- TODO: Add appropriate ALTER TABLE statement here`);
          break;
      }

      statements.push(""); // blank line between operations
    }

    const description = this.generateDescription(diffs);
    const sql = this.formatSql(version, description, statements);

    return { version, description, sql };
  }

  private generateCreateTable(entity: any, tableName: string): string[] {
    const statements: string[] = [];
    const columns = getColumns(entity);
    const foreignKeys = getForeignKeys(entity);

    // Create enum types first
    for (const col of columns) {
      if (col.type === ColumnType.Enum && col.enum) {
        const enumName = `${tableName}_${col.columnName}_enum`;
        const enumValues = Object.values(col.enum)
          .filter((v) => typeof v === "string")
          .map((v) => `'${v}'`)
          .join(", ");
        statements.push(`CREATE TYPE "${enumName}" AS ENUM (${enumValues});`);
      }
    }

    // Create table with columns and foreign keys
    const columnDefs = columns.map((col) => "  " + this.getColumnSql(tableName, col));

    // Add foreign key constraints
    const fkDefs = foreignKeys.map((fk) => {
      const col = columns.find((c) => c.propertyKey === fk.propertyKey);
      const columnName = col?.columnName || fk.propertyKey;
      return "  " + this.getForeignKeySql(tableName, columnName, fk);
    });

    const allDefs = [...columnDefs, ...fkDefs];

    statements.push(`CREATE TABLE "${tableName}" (`);
    statements.push(allDefs.join(",\n"));
    statements.push(`);`);

    return statements;
  }

  private getForeignKeySql(
    tableName: string,
    columnName: string,
    fk: ForeignKeyMetadata
  ): string {
    const constraintName = `fk_${tableName}_${columnName}`;
    let sql = `CONSTRAINT "${constraintName}" FOREIGN KEY ("${columnName}") REFERENCES "${fk.referencedTable}"("${fk.referencedColumn}")`;

    if (fk.onDelete) {
      sql += ` ON DELETE ${fk.onDelete}`;
    }

    return sql;
  }

  private generateAddColumn(
    entity: any,
    tableName: string,
    propertyKey: string
  ): string[] {
    const statements: string[] = [];
    const columns = getColumns(entity);
    const foreignKeys = getForeignKeys(entity);
    const column = columns.find((col) => col.propertyKey === propertyKey);

    if (!column) {
      statements.push(`-- ERROR: Column ${propertyKey} not found on entity`);
      return statements;
    }

    // Create enum type if needed
    if (column.type === ColumnType.Enum && column.enum) {
      const enumName = `${tableName}_${column.columnName}_enum`;
      const enumValues = Object.values(column.enum)
        .filter((v) => typeof v === "string")
        .map((v) => `'${v}'`)
        .join(", ");
      statements.push(`CREATE TYPE "${enumName}" AS ENUM (${enumValues});`);
    }

    statements.push(
      `ALTER TABLE "${tableName}" ADD COLUMN ${this.getColumnSql(tableName, column)};`
    );

    // Add foreign key constraint if defined
    const fk = foreignKeys.find((f) => f.propertyKey === propertyKey);
    if (fk) {
      const constraintName = `fk_${tableName}_${column.columnName}`;
      let fkSql = `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${column.columnName}") REFERENCES "${fk.referencedTable}"("${fk.referencedColumn}")`;
      if (fk.onDelete) {
        fkSql += ` ON DELETE ${fk.onDelete}`;
      }
      statements.push(fkSql + ";");
    }

    return statements;
  }

  private getColumnSql(tableName: string, col: ColumnMetadata): string {
    let sql = `"${col.columnName}" `;

    if (col.primary) {
      sql += `SERIAL PRIMARY KEY`;
    } else {
      switch (col.type) {
        case ColumnType.Number:
          sql += "INT";
          break;
        case ColumnType.String:
          if (col.maxLength) {
            sql += `VARCHAR(${col.maxLength})`;
          } else {
            sql += "TEXT";
          }
          break;
        case ColumnType.Enum:
          if (col.enum) {
            const enumName = `${tableName}_${col.columnName}_enum`;
            sql += `"${enumName}"`;
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

    if (!col.optional && !col.primary) {
      sql += " NOT NULL";
    }

    return sql;
  }

  private generateDescription(diffs: DiffOperation[]): string {
    const parts: string[] = [];

    const createTables = diffs.filter((d) => d.type === "CREATE_TABLE");
    const addColumns = diffs.filter((d) => d.type === "ADD_COLUMN");
    const dropColumns = diffs.filter((d) => d.type === "DROP_COLUMN");
    const alterColumns = diffs.filter((d) => d.type === "ALTER_COLUMN");

    if (createTables.length > 0) {
      const names = createTables.map((d) => d.tableName).join(", ");
      parts.push(`Create ${names} table${createTables.length > 1 ? "s" : ""}`);
    }

    if (addColumns.length > 0) {
      if (addColumns.length <= 2) {
        const cols = addColumns
          .map((d) => `${d.columnName} to ${d.tableName}`)
          .join(", ");
        parts.push(`Add ${cols}`);
      } else {
        parts.push(`Add ${addColumns.length} columns`);
      }
    }

    if (dropColumns.length > 0) {
      parts.push(
        `Drop ${dropColumns.length} column${dropColumns.length > 1 ? "s" : ""}`
      );
    }

    if (alterColumns.length > 0) {
      parts.push(
        `Alter ${alterColumns.length} column${alterColumns.length > 1 ? "s" : ""}`
      );
    }

    return parts.join(", ") || "Schema changes";
  }

  private formatSql(
    version: number,
    description: string,
    statements: string[]
  ): string {
    const lines: string[] = [];

    lines.push(`-- Migration: ${version}`);
    lines.push(`-- Description: ${description}`);
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push(``);
    lines.push(...statements);

    return lines.join("\n");
  }
}
