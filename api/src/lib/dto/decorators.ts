export const PROPERTY_METADATA_KEY = Symbol("orm:property");

export enum PropertyType {
  Number,
  String,
}

export interface PropertyMetadata {
  propertyKey: string;
  type: PropertyType;
  optional: boolean;
}

export interface PropertyDecoratorOptions {
  optional?: boolean;
}

export function Property(
  type: PropertyType,
  options?: PropertyDecoratorOptions
) {
  return function (target: Object, propertyKey: string) {
    // Get existing columns or initialize empty array
    const columns: PropertyMetadata[] =
      Reflect.getMetadata(PROPERTY_METADATA_KEY, target.constructor) || [];

    columns.push({
      propertyKey,
      type: type,
      optional: options?.optional ?? false,
    });

    // Store back on the constructor (class itself)
    Reflect.defineMetadata(PROPERTY_METADATA_KEY, columns, target.constructor);
  };
}

export function getProperties(target: any): PropertyMetadata[] {
  return Reflect.getMetadata(PROPERTY_METADATA_KEY, target) || [];
}
