// dependency-proxy.ts
type DependencyTracker = {
  getAccessedProperties: () => Set<string>;
  reset: () => void;
};

export function createProxy<T extends object>(
  target: T
): { proxy: T; tracker: DependencyTracker } {
  const accessedProperties = new Set<string>();
  const handler: ProxyHandler<object> = {
    get(target, prop, receiver) {
      if (typeof prop !== "string") return Reflect.get(target, prop, receiver);

      accessedProperties.add(prop);
      const value = Reflect.get(target, prop, receiver);

      if (typeof value === "object" && value !== null) {
        return new Proxy(value, handler);
      }

      return value;
    },
    set(target, prop, value, receiver) {
      if (typeof prop !== "string")
        return Reflect.set(target, prop, value, receiver);

      accessedProperties.add(prop);
      return Reflect.set(target, prop, value, receiver);
    },
  };

  const tracker: DependencyTracker = {
    getAccessedProperties: () => new Set(accessedProperties),
    reset: () => accessedProperties.clear(),
  };

  return {
    proxy: new Proxy(target as object, handler) as T,
    tracker,
  };
}

export function trackDependencies<T>(
  fn: () => T,
  tracker: DependencyTracker
): T {
  tracker.reset();
  const result = fn();
  const deps = tracker.getAccessedProperties();
  return result;
}
