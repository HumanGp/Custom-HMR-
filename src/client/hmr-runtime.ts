// hmr-runtime.ts
type HMRPayload =
  | { type: "update"; file: string }
  | { type: "full-reload" }
  | { type: "error"; error: string };

type HotModuleState = {
  data: any;
  acceptCallbacks: Array<(module: any) => void>;
  disposeCallbacks: Array<() => void>;
  isAccepted: boolean;
  isDeclined: boolean;
  _events?: Record<string, Array<(...args: any[]) => void>>;
};

interface HMRState {
  modules: Record<
    string,
    {
      hot: HotModuleState;
      exports: any;
      acceptCallbacks: Array<(module: any) => void>;
      disposeCallbacks: Array<() => void>;
    }
  >;
  pendingUpdates: Set<string>;
  isApplyingUpdates: boolean;
}

export function createHMRContext(port: number) {
  const state: HMRState = {
    modules: {},
    pendingUpdates: new Set(),
    isApplyingUpdates: false,
  };

  const socket = new WebSocket(`ws://localhost:${port}`);

  socket.addEventListener("message", ({ data }) => {
    const payload = JSON.parse(data) as HMRPayload;
    handleMessage(payload);
  });

  function handleMessage(payload: HMRPayload) {
    switch (payload.type) {
      case "update":
        queueUpdate(payload.file);
        break;
      case "full-reload":
        window.location.reload();
        break;
      case "error":
        console.error(`[HMR] ${payload.error}`);
        break;
    }
  }

  function queueUpdate(file: string) {
    state.pendingUpdates.add(file);
    if (!state.isApplyingUpdates) {
      applyUpdates();
    }
  }

  async function applyUpdates() {
    state.isApplyingUpdates = true;

    try {
      while (state.pendingUpdates.size > 0) {
        const file = state.pendingUpdates.values().next().value;
        if (typeof file === "string") {
          state.pendingUpdates.delete(file);
          await applyUpdate(file);
        } else {
          // Skip if file is undefined
          break;
        }
      }
    } finally {
      state.isApplyingUpdates = false;
    }
  }

  async function applyUpdate(file: string) {
    const moduleState = state.modules[file];
    if (!moduleState) return;

    // Run dispose handlers
    moduleState.disposeCallbacks.forEach((cb) => cb());

    // Preserve hot data
    const hotData = moduleState.hot?.data;

    try {
      // Fetch and evaluate updated module
      const newModule = await import(`${file}?t=${Date.now()}`);

      // Update module state
      moduleState.exports = newModule;
      if (moduleState.hot) {
        moduleState.hot.data = hotData;
      }

      // Run accept handlers
      moduleState.acceptCallbacks.forEach((cb) => cb(newModule));
    } catch (err) {
      console.error(`[HMR] Failed to update ${file}:`, err);
    }
  }

  return {
    createHotContext(importMeta: ImportMeta) {
      const id = importMeta.url;

      if (!state.modules[id]) {
        state.modules[id] = {
          exports: {},
          hot: {
            data: {},
            acceptCallbacks: [],
            disposeCallbacks: [],
            isAccepted: false,
            isDeclined: false,
          },
          acceptCallbacks: [],
          disposeCallbacks: [],
        };
      }

      const moduleState = state.modules[id];

      const hot = {
        get data() {
          return moduleState.hot.data;
        },
        set data(value) {
          moduleState.hot.data = value;
        },
        accept(callback?: (module: any) => void) {
          if (callback) {
            moduleState.acceptCallbacks.push(callback);
          } else {
            moduleState.hot.isAccepted = true;
          }
        },
        decline() {
          moduleState.hot.isDeclined = true;
        },
        dispose(callback: () => void) {
          moduleState.disposeCallbacks.push(callback);
        },
        invalidate() {
          window.location.reload();
        },
        on(event: string, callback: (...args: any[]) => void) {
            //  HMR event system
            if (!moduleState.hot._events) {
            moduleState.hot._events = {};
            }
            if (!moduleState.hot._events[event]) {
            moduleState.hot._events[event] = [];
            }
            moduleState.hot._events[event].push(callback);
        },
      };

      return hot;
    },
  };
}
