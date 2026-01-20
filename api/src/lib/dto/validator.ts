import { UserError } from "../common";
import { getProperties, PropertyMetadata, PropertyType } from "./decorators";

export class ValidationError extends UserError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateDTO<T>(obj: any, dtoClass: any) {
  const properties = getProperties(dtoClass);

  let validated: any = {};

  for (const prop of properties) {
    const value = obj[prop.propertyKey];
    const validatedValue = validateValue(prop, value);

    validated[prop.propertyKey] = validatedValue;
  }

  return validated as T;
}

export function validateValue(property: PropertyMetadata, value: any) {
  switch (property.type) {
    case PropertyType.String:
      if (typeof value !== "string") {
        throw new ValidationError(
          `${property.propertyKey}: expected string, got "${value}"`
        );
      }
      return value;
    case PropertyType.Number:
      if (typeof value !== "number") {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          throw new ValidationError(
            `${property.propertyKey}: expected number, got "${value}"`
          );
        }
        return parsed;
      }
      return value;
    default:
      throw new Error(`Unknown property type ${property.type}`);
  }
}
