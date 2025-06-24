// module-graph.ts
import { createProxy, trackDependencies } from './dependency-proxy';

// Enhanced module node with proxy capabilities
export interface ModuleNode {
  id: string;
  rawExports: any;
  exports: any;
  importers: Set<string>;
  imports: Set<string>;
  hot?: HotModuleState;
  proxy?: any;
  dependencyTracker?: any;
}

export interface HotModuleState {
  data: any;
  acceptCallbacks: Array<(module: any) => void>;
  disposeCallbacks: Array<() => void>;
  isAccepted: boolean;
  isDeclined: boolean;
}

export class ModuleGraph {
  private modules = new Map<string, ModuleNode>();
  private dependencyGraph = new Map<string, Set<string>>();
  private reverseDependencyGraph = new Map<string, Set<string>>();
  private circularDependencyCache = new Map<string, string[][]>();
  private version = 0;

  updateModule(id: string, code: string, isHmrEnabled = true) {
    const imports = this.parseImports(id, code);
    const existing = this.getModule(id);
    
    // Create enhanced module node
    const node: ModuleNode = existing || {
      id,
      rawExports: {},
      exports: {},
      importers: new Set(),
      imports: new Set(),
    };

    // Track dependencies only for HMR-enabled modules
    if (isHmrEnabled) {
      if (!node.proxy) {
        const { proxy, tracker } = createProxy(node.rawExports);
        node.exports = proxy;
        node.dependencyTracker = tracker;
      }
    } else {
      node.exports = node.rawExports;
    }

    // Update imports and dependency graph
    this.updateDependencies(id, imports, node.imports);
    
    this.modules.set(id, node);
    this.version++;
    this.circularDependencyCache.clear();
  }

  private updateDependencies(moduleId: string, newImports: string[], oldImports: Set<string>) {
    // Calculate diff between old and new imports
    const added = new Set([...newImports].filter(x => !oldImports.has(x)));
    const removed = new Set([...oldImports].filter(x => !newImports.includes(x)));

    // Update forward dependencies
    this.dependencyGraph.set(moduleId, new Set(newImports));

    // Update reverse dependencies
    for (const dep of added) {
      if (!this.reverseDependencyGraph.has(dep)) {
        this.reverseDependencyGraph.set(dep, new Set());
      }
      this.reverseDependencyGraph.get(dep)!.add(moduleId);
    }

    for (const dep of removed) {
      const dependents = this.reverseDependencyGraph.get(dep);
      if (dependents) {
        dependents.delete(moduleId);
        if (dependents.size === 0) {
          this.reverseDependencyGraph.delete(dep);
        }
      }
    }
  }

  // Topological sort with cycle detection using Tarjan's algorithm
  getUpdateChain(changedFile: string): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const result: string[] = [];
    const cycles: string[][] = [];

    const visit = (id: string, path: string[] = []) => {
      if (recursionStack.has(id)) {
        cycles.push([...path, id]);
        return;
      }
      if (visited.has(id)) return;

      visited.add(id);
      recursionStack.add(id);

      const dependents = this.getDependents(id);
      dependents.forEach(depId => visit(depId, [...path, id]));

      result.push(id);
      recursionStack.delete(id);
    };

    visit(changedFile);

    if (cycles.length > 0) {
      console.warn('Circular dependencies detected:', cycles);
      // For HMR purposes, i'll still return the chain but warn about cycles
    }

    return result.reverse();
  }

  // More efficient cycle detection using Kosaraju's algorithm
  detectStronglyConnectedComponents(): string[][] {
    const visited = new Set<string>();
    const order: string[] = [];
    const components: string[][] = [];

    // First pass to record finish times
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const dependencies = this.dependencyGraph.get(id) || new Set();
      dependencies.forEach(depId => visit(depId));

      order.push(id);
    };

    this.modules.forEach((_, id) => visit(id));

    // Transpose the graph
    const transposedGraph = new Map<string, Set<string>>();
    this.dependencyGraph.forEach((deps, id) => {
      deps.forEach(depId => {
        if (!transposedGraph.has(depId)) {
          transposedGraph.set(depId, new Set());
        }
        transposedGraph.get(depId)!.add(id);
      });
    });

    // Second pass on transposed graph
    visited.clear();
    const assign = (id: string, component: string[]) => {
      if (visited.has(id)) return;
      visited.add(id);
      component.push(id);

      const dependents = transposedGraph.get(id) || new Set();
      dependents.forEach(depId => assign(depId, component));
    };

    while (order.length > 0) {
      const id = order.pop()!;
      if (!visited.has(id)) {
        const component: string[] = [];
        assign(id, component);
        if (component.length > 1) { // Only report actual cycles
          components.push(component);
        }
      }
    }

    return components;
  }

  // Memoized version of cycle detection
  getCircularDependencies(): string[][] {
    const cacheKey = this.version.toString();
    if (this.circularDependencyCache.has(cacheKey)) {
      return this.circularDependencyCache.get(cacheKey)!;
    }

    const cycles = this.detectStronglyConnectedComponents();
    this.circularDependencyCache.set(cacheKey, cycles);
    return cycles;
  }


      getModule(id: string): ModuleNode | undefined {
    return this.modules.get(id);
     }     
  getDependents(id: string): string[] {
    return Array.from(this.reverseDependencyGraph.get(id) || []);
  }

  parseImports(id: string, code: string): string[] {
    // Implement a simple regex-based import parser
    const importRegex = /import\s+(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }
    return imports;
} 
  getModuleExports(id: string): any {
    const module = this.getModule(id);
    return module ? module.exports : undefined;
  }

  getModuleRawExports(id: string): any {
    const module = this.getModule(id);
    return module ? module.rawExports : undefined;
  }   

  getModuleProxy(id: string): any {
    const module = this.getModule(id);
    return module ? module.proxy : undefined;
  }   

  getModuleDependencyTracker(id: string): any {
    const module = this.getModule(id);
    return module ? module.dependencyTracker : undefined;
  } 

  getModuleHotState(id: string): HotModuleState | undefined {
    const module = this.getModule(id);
    return module ? module.hot : undefined;
  } 

}


function getModuleHotState(id: string): ModuleGraph['getModuleHotState'] {
  // This function is intended to be used as a method of the ModuleGraph class.
  // This function assumes access to a ModuleGraph instance.
  // I should pass the ModuleGraph instance as an argument or bind it appropriately.
  if (this instanceof ModuleGraph) {
    return this.getModuleHotState(id);
  }
  // If called without a ModuleGraph instance, throw an error
  throw new Error('getModuleHotState requires a ModuleGraph instance. Use ModuleGraph.getModuleHotState(id) instead.');
}



