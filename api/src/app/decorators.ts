import "reflect-metadata";

const CONTROLLER_METADATA_KEY = Symbol("app:controller");
const ROUTE_METADATA_KEY = Symbol("app:route");
const PARAM_METADATA_KEY = Symbol("route:param");

// -- Controller

/** Decorator for controller. */
export function Controller(basePath: string) {
  return function (target: any) {
    Reflect.defineMetadata(CONTROLLER_METADATA_KEY, basePath, target);
  };
}

export function getControllerMetadata(target: any): string | undefined {
  return Reflect.getMetadata(CONTROLLER_METADATA_KEY, target);
}

// -- Route

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

export interface RouteMetadata {
  method: HttpMethod;
  path: string;
  public: boolean;
}

export interface RouteOptions {
  /** Routes are private by default. */
  public?: boolean;
}

export function Route(
  method: HttpMethod,
  path: string,
  options?: RouteOptions
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    Reflect.defineMetadata(
      ROUTE_METADATA_KEY,
      { method, path, public: options?.public ?? false },
      target,
      propertyKey
    );
  };
}

export function getRouteMetadata(
  target: any,
  propertyKey: string
): RouteMetadata | undefined {
  return Reflect.getMetadata(ROUTE_METADATA_KEY, target, propertyKey);
}

export function getAllRoutes(target: any): Map<string, RouteMetadata> {
  const routes = new Map<string, RouteMetadata>();
  const prototype = target.prototype || target;

  for (const propertyName of Object.getOwnPropertyNames(prototype)) {
    const routeMetadata = getRouteMetadata(prototype, propertyName);
    if (routeMetadata) {
      routes.set(propertyName, routeMetadata);
    }
  }

  return routes;
}

// -- Param

export type ParamType = "req" | "res" | "body" | "query" | "params" | "user";

export interface ParamMetadata {
  index: number;
  type: ParamType;
  data?: string; // for @Body('fieldName'), @Param('id'), etc.
}

export function createParamDecorator(type: ParamType, data?: string) {
  return (target: any, propertyKey: string, parameterIndex: number) => {
    const existingParams: ParamMetadata[] =
      Reflect.getMetadata(PARAM_METADATA_KEY, target, propertyKey) || [];
    existingParams.push({ index: parameterIndex, type, data });

    Reflect.defineMetadata(
      PARAM_METADATA_KEY,
      existingParams,
      target,
      propertyKey
    );
  };
}

export function getParamMetadata(
  target: any,
  method: string
): ParamMetadata[] | undefined {
  return Reflect.getMetadata(PARAM_METADATA_KEY, target, method);
}

export const Req = () => createParamDecorator("req");
export const Res = () => createParamDecorator("res");
export const Body = (field?: string) => createParamDecorator("body", field);
export const Query = (field?: string) => createParamDecorator("query", field);
export const Param = (field?: string) => createParamDecorator("params", field);

export const User = () => createParamDecorator("user");
