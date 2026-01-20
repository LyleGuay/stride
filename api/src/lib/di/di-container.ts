import { INJECT_KEY } from "./decorators";

class DIContainer {
  private instances = new Map<any, any>();
  private providers = new Map<any, any>();

  /**
   * Register a provider for a token
   * Useful for interfaces or abstract classes
   */
  register(token: any, provider?: any): void {
    this.providers.set(token, provider ?? token);
  }

  /**
   * Resolve a class and all its dependencies
   */
  resolve<T>(target: any): T {
    // Return cached singleton if exists
    if (this.instances.has(target)) {
      return this.instances.get(target);
    }

    // Get constructor parameter types (auto-emitted by TypeScript)
    const paramTypes: any[] =
      Reflect.getMetadata("design:paramtypes", target) || [];

    // Get explicit @Inject() tokens
    const injectTokens: Map<number, any> =
      Reflect.getMetadata(INJECT_KEY, target) || new Map();

    // Resolve each dependency
    const dependencies = paramTypes.map((type, index) => {
      // Use explicit token if provided, otherwise use the type
      const token = injectTokens.get(index) || type;
      // Look up provider for token, or use token as provider
      const provider = this.providers.get(token) || token;
      return this.resolve(provider);
    });

    // Create instance with resolved dependencies
    const instance = new target(...dependencies);
    this.instances.set(target, instance);

    return instance;
  }
}

export const diContainer = new DIContainer();
