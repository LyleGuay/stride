import "reflect-metadata";

export const TABLE_METADATA_KEY = Symbol("orm:table");
export const COLUMN_METADATA_KEY = Symbol("orm:column");

export interface TableMetadata {
  tableName: string;
  classObj: any;
}

export function Table(tablename: string) {
  return function (target: any) {
    const metadata: TableMetadata = {
      tableName: tablename,
      classObj: target,
    };
    Reflect.defineMetadata(TABLE_METADATA_KEY, metadata, target);
  };
}

export function getTableMetadata(target: any): string {
  const metadata: TableMetadata | undefined = Reflect.getMetadata(
    TABLE_METADATA_KEY,
    target
  );

  if (!metadata) {
    throw new Error(`No @Table() decorator found on ${target.name}`);
  }

  return metadata.tableName;
}

export enum ColumnType {
  Number,
  String,
  Enum,
  Timestamp,
  Date,
}

export interface ColumnMetadata {
  propertyKey: string;
  columnName: string;
  type: ColumnType;
  primary: boolean;
  optional: boolean;
  maxLength?: number;
  enum?: any;
}

export interface ColumnDecoratorOptions {
  primary?: boolean;
  optional?: boolean;
  maxLength?: number;
  enum?: any;
}

export function Column(
  columnName: string,
  type: ColumnType,
  options?: ColumnDecoratorOptions
) {
  return function (target: Object, propertyKey: string) {
    // Get existing columns or initialize empty array
    const columns: ColumnMetadata[] =
      Reflect.getMetadata(COLUMN_METADATA_KEY, target.constructor) || [];

    columns.push({
      propertyKey,
      columnName: columnName,
      type: type,
      primary: options?.primary ?? false,
      optional: options?.optional ?? false,
      maxLength: options?.maxLength,
      enum: options?.enum,
      // nullable: options?.nullable,
    });

    // Store back on the constructor (class itself)
    Reflect.defineMetadata(COLUMN_METADATA_KEY, columns, target.constructor);
  };
}

export function getColumns(target: any): ColumnMetadata[] {
  return Reflect.getMetadata(COLUMN_METADATA_KEY, target) || [];
}

export function getPrimaryKey(target: any): ColumnMetadata | undefined {
  const columns = getColumns(target);
  return columns.find((col) => col.primary);
}
