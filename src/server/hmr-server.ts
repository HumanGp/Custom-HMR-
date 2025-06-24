import { WebSocketServer, WebSocket } from "ws";
import chokidar, { FSWatcher } from "chokidar";
import { transform as esbuildTransform, Loader } from "esbuild";
import { ModuleGraph } from "./module-graph";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface HMRServerOptions {
  port: number;
  root: string;
  onFileChange?: (file: string) => void;
}

interface HMRUpdate {
  type: 'update' | 'reload' | 'error';
  file: string;
  clients: WebSocket[];
  timestamp: number;
  // Can include patch information for differential updates
}
                 
// hmr-server.ts
export class HMRServer {
  private wss: WebSocketServer;
  private moduleGraph: ModuleGraph;
  private watcher: FSWatcher;
  private moduleCache = new Map<string, { code: string; hash: string; ast?: any }>();
  private pendingUpdates = new Map<string, NodeJS.Timeout>();
  private clientModules = new Map<string, Set<WebSocket>>();
  private dependencyTree = new Map<string, Set<string>>();

  constructor(options: HMRServerOptions) {
    this.moduleGraph = new ModuleGraph();
    this.wss = new WebSocketServer({ port: options.port });
    this.watcher = chokidar.watch(options.root, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 10
      }
    });

    this.setupWebSocketHooks();
  }

  private setupWebSocketHooks() {
    this.wss.on('connection', (ws: WebSocket) => {
      // Track which modules each client has loaded
      const clientModules = new Set<string>();
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'module-loaded') {
            clientModules.add(message.file);
            if (!this.clientModules.has(message.file)) {
              this.clientModules.set(message.file, new Set());
            }
            this.clientModules.get(message.file)!.add(ws);
          }
        } catch (e) {
          console.error('Error processing client message:', e);
        }
      });

      ws.on('close', () => {
        // Clean up client module references
        clientModules.forEach(file => {
          const clients = this.clientModules.get(file);
          if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
              this.clientModules.delete(file);
            }
          }
        });
      });
    });
  }

  private async processUpdate(file: string) {
    try {
      const before = this.moduleGraph.getModule(file)?.exports;
      const newCode = await this.transformModule(file);
      
      // Get the update chain in proper order
      const updateChain = this.moduleGraph.getUpdateChain(file);
      
      // Calculate minimal updates
      const updates = this.calculateUpdates(updateChain);
      
      // Notify clients with minimal patches
      this.notifyClients(updates);
    } catch (err) {
      console.error(`Error processing update for ${file}:`, err);
      this.notifyError(file, err instanceof Error ? err : new Error(String(err)));
    }
  }

  private calculateUpdates(updateChain: string[]): HMRUpdate[] {
    return updateChain.map(file => {
      const module = this.moduleGraph.getModule(file)!;
      const clients = this.clientModules.get(file) || new Set();
      
      return {
        type: 'update',
        file,
        clients: Array.from(clients),
        timestamp: Date.now(),
        // other relevant update information
      };
    });
  }

  private async transformModule(file: string): Promise<string> {
    const content = await fs.promises.readFile(file, 'utf-8');
    const currentHash = hash(content);
    const cached = this.moduleCache.get(file);

    if (cached && cached.hash === currentHash) {
      return cached.code;
    }

    // Use esbuild for transformation
    const result = await esbuildTransform(content, {
      loader: this.getLoader(file),
      sourcemap: 'inline',
      target: 'esnext',
      format: 'esm',
      jsx: 'automatic',
      jsxDev: true,
      treeShaking: true,
    });

    // Cache the transformed code
    this.moduleCache.set(file, {
      code: result.code,
      hash: currentHash,
    });

    return result.code;
  }

  private getLoader(file: string): Loader {
    const ext = path.extname(file).slice(1);
    switch (ext) {
      case 'ts': return 'ts';
      case 'tsx': return 'tsx';
      case 'jsx': return 'jsx';
      case 'json': return 'json';
      case 'css': return 'css';
      default: return 'js';
    }
  }

  private notifyClients(updates: HMRUpdate[]) {
    updates.forEach(update => {
      update.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(update));
        }
      });
    });
  }

  private notifyError(file: string, error: Error) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'error',
          file,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        }));
      }
    });
  }
}

function hash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}


