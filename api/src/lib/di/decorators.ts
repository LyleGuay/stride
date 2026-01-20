import "reflect-metadata";

export const INJECT_KEY = Symbol("di:inject");

export function Inject(token?: any) {
  return function (
    target: any,
    _propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) {
    const existingTokens: Map<number, any> =
      Reflect.getMetadata(INJECT_KEY, target) || new Map();
    existingTokens.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_KEY, existingTokens, target);
  };
}
