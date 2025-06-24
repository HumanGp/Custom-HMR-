// module-system.ts

// Polyfill type for FinalizationRegistry if not available (for TypeScript)
declare global {
  // @ts-ignore
  var FinalizationRegistry: typeof FinalizationRegistry | undefined;
}

// Dummy implementation for createDependencyTracker *******
function createDependencyTracker() {
  return {
    track: (prop: string | symbol) => {},
  };
}

interface Module {
  id: string;
  importers: Set<string>;
  exports: any;
  hot?: {
    data: any;
    acceptCallbacks: Array<() => void>;
    disposeCallbacks: Array<() => void>;
    isAccepted: boolean;
    isDeclined: boolean;
    dependencyTracker: ReturnType<typeof createDependencyTracker>;
  };
  proxy?: any;
}

export class ClientModuleSystem {
  private modules = new Map<string, Module>();
  private registry = typeof FinalizationRegistry !== "undefined"
    ? new FinalizationRegistry((id: string) => {
        this.cleanupModule(id);
      })
    : {
        register: () => {},
      } as any;
  private proxyHandlers: ProxyHandler<Module> = {
    get(target, prop, receiver) {
      if (prop in target.exports) {
        target.hot?.dependencyTracker.track(prop);
        return Reflect.get(target.exports, prop, receiver);
      }
      return Reflect.get(target, prop, receiver);
    },
  };

  async importModule(url: string): Promise<any> {
    if (this.modules.has(url)) {
      return this.getModuleExports(url);
    }

    const module: Module = this.createModule(url);
    this.modules.set(url, module);

    try {
      await this.fetchAndInstantiate(url, module);
      return this.getModuleExports(url);
    } catch (err) {
      this.modules.delete(url);
      throw err;
    }
  }

  private createModule(url: string): Module {
    const exports = {};
    const module: Module = {
      id: url,
      importers: new Set(),
      exports,
      hot: {
        data: {},
        acceptCallbacks: [],
        disposeCallbacks: [],
        isAccepted: false,
        isDeclined: false,
        dependencyTracker: createDependencyTracker(),
      },
    };

    // Create a proxy that tracks access to exports
    module.proxy = new Proxy(module, this.proxyHandlers);

    // Register cleanup when module is no longer referenced
    this.registry.register(exports, url);

    return module;
  }

  private getModuleExports(url: string): any {
    const module = this.modules.get(url);
    if (!module) throw new Error(`Module ${url} not found`);

    return module.hot ? module.proxy : module.exports;
  }

  private async fetchAndInstantiate(url: string, module: Module) {
    const code = await this.fetchModule(url);
    const importMeta = {
      url,
      hot: module.hot,
    };

    const require = (dep: string) => {
      const depUrl = this.resolveUrl(url, dep);
      const depModule = this.importModule(depUrl);
      module.importers.add(depUrl);
      return depModule;
    };

    const instantiate = new Function(
      "module",
      "exports",
      "require",
      "importMeta",
      code
    );

    instantiate(module, module.exports, require, importMeta);
  }

  // Enhanced proxy support: allow getting the proxy for a module by URL
  getProxy(url: string): any {
    const module = this.modules.get(url);
    if (!module) throw new Error(`Module ${url} not found`);
    return module.proxy;
  }

  // Allow updating exports for HMR or manual updates
  updateExports(url: string, newExports: any): void {
    const module = this.modules.get(url);
    if (!module) throw new Error(`Module ${url} not found`);
    Object.assign(module.exports, newExports);
  }

  // Accept HMR for a module
  accept(url: string, callback?: () => void): void {
    const module = this.modules.get(url);
    if (!module || !module.hot) throw new Error(`Module ${url} not found or not hot`);
    module.hot.isAccepted = true;
    if (callback) module.hot.acceptCallbacks.push(callback);
  }

  // Dispose HMR for a module
  dispose(url: string, callback: () => void): void {
    const module = this.modules.get(url);
    if (!module || !module.hot) throw new Error(`Module ${url} not found or not hot`);
    module.hot.disposeCallbacks.push(callback);
  }

  // Decline HMR for a module
  decline(url: string): void {
    const module = this.modules.get(url);
    if (!module || !module.hot) throw new Error(`Module ${url} not found or not hot`);
    module.hot.isDeclined = true;
  }

  private cleanupModule(id: string): void {
    this.modules.delete(id);
  }

  // Fetches the module code from the given URL
  private async fetchModule(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch module at ${url}: ${response.statusText}`);
    }
    return await response.text();
  }

  // Resolves a dependency path relative to the current module URL
  private resolveUrl(base: string, relative: string): string {
    return new URL(relative, base).toString();
  }
}
