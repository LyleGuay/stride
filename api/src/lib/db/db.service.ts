import postgres from "postgres";
import {
  getTableMetadata,
  getPrimaryKey,
  getColumns,
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

/** Returns entity converted to object that can be inserted into DB. */
function getEntityData<T extends object>(
  entity: T,
  entityClass: any
): Record<string, unknown> {
  const columns = getColumns(entityClass);
  const data: Record<string, unknown> = {};

  for (const col of columns) {
    const value = (entity as any)[col.propertyKey];
    if (value !== undefined) {
      data[col.columnName] = value;
    }
  }

  return data;
}

export class DB {
  public sql: ReturnType<typeof postgres>;

  constructor(connectionString?: string) {
    this.sql = postgres(connectionString || process.env.DATABASE_URL || "", {
      types: {
        // For dates, we treat as simple string in format: YYYY-MM-DD
        date: {
          to: 1082,
          from: [1082],
          serialize: (x: string) => x,
          parse: (x: string) => x,
        },
      },
    });
  }

  create<T extends object>(entityClass: new () => T): T & Entity {
    const entity = new entityClass();
    return createEntity(entity, entityClass, true);
  }

  async fetch<T extends object>(
    entityClass: new () => T,
    where?: Partial<T>
  ): Promise<(T & Entity)[]> {
    const table = getTableMetadata(entityClass);
    const columns = getColumns(entityClass);
    const columnMap = new Map<string, ColumnMetadata>();

    for (const col of columns) {
      columnMap.set(col.propertyKey, col);
    }

    let rows: T[];

    if (where && Object.keys(where).length > 0) {
      const keys = Object.keys(where);
      const conditions = keys
        .map((key, i) => `"${columnMap.get(key)?.columnName}" = $${i + 1}`)
        .join(" AND ");
      const values = Object.values(where);

      rows = await this.sql.unsafe<T[]>(
        `SELECT * FROM "${table}" WHERE ${conditions}`,
        values as any[]
      );
    } else {
      rows = await this.sql.unsafe<T[]>(`SELECT * FROM "${table}"`);
    }

    return rows.map((row) => {
      const entity = new entityClass();

      for (const col of columns) {
        (entity as any)[col.propertyKey] = (row as any)[col.columnName];
      }

      return createEntity(entity, entityClass, false);
    });
  }

  async fetchOne<T extends object>(
    entityClass: new () => T,
    where: Partial<T>
  ): Promise<(T & Entity) | null> {
    const results = await this.fetch(entityClass, where);
    return results[0] || null;
  }

  async save<T extends object>(entity: T & Entity): Promise<void> {
    const entityClass = getEntityClass(entity);
    const table = getTableMetadata(entityClass);
    const pk = getPrimaryKey(entityClass);
    const columnsDefs = getColumns(entityClass);

    if (!pk) {
      throw new Error(`No primary key defined on ${entityClass.name}`);
    }

    if (isNew(entity)) {
      // INSERT
      const data = getEntityData(entity, entityClass);
      const keys = Object.keys(data);
      const columns = keys.map((k) => `"${k}"`).join(", ");
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const values = Object.values(data);

      const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`;

      console.log(`Insert SQL: ${sql}`);

      const rows = await this.sql.unsafe<any[]>(sql, values as any[]);

      if (rows[0]) {
        const inserted = rows[0];

        for (const col of columnsDefs) {
          (entity as any)[col.propertyKey] = inserted[col.columnName];
        }

        // Object.assign(entity, rows[0]);
      }
    } else if (isDirty(entity)) {
      // UPDATE
      const changes = getChanges(entity);
      const dataKeys = Object.keys(changes);
      const columns = getColumns(entityClass);
      const columnMap = new Map<string, ColumnMetadata>();

      for (const col of columns) {
        columnMap.set(col.propertyKey, col);
      }

      if (dataKeys.length === 0) return;

      const setClause = dataKeys
        .map((key, i) => `"${columnMap.get(key)?.columnName}" = $${i + 1}`)
        .join(", ");

      const pkValue = (entity as any)[pk.propertyKey];
      const values = [...Object.values(changes), pkValue];

      const sql = `UPDATE "${table}" SET ${setClause} WHERE "${
        pk.columnName
      }" = $${dataKeys.length + 1}`;

      console.log(`Update SQL: ${sql}`);

      await this.sql.unsafe(sql, values as any[]);
    }

    markClean(entity);
  }

  async delete<T extends object>(entity: T & Entity): Promise<void> {
    const entityClass = getEntityClass(entity);
    const table = getTableMetadata(entityClass);
    const pk = getPrimaryKey(entityClass);

    if (!pk) {
      throw new Error(`No primary key defined on ${entityClass.name}`);
    }

    const pkValue = (entity as any)[pk.propertyKey];

    await this.sql.unsafe(
      `DELETE FROM "${table}" WHERE "${pk.columnName}" = $1`,
      [pkValue] as any[]
    );
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
