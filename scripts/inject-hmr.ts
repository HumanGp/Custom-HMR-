import { connectHMRClient, createHMRAccept } from "../src/client/hmr-runtime";

// Extend ImportMeta to include 'hot'
declare global {
  interface ImportMeta {
    hot?: any;
  }
}

// Auto-inject into ES modules
const hasImportMeta = typeof globalThis !== "undefined" && typeof (globalThis as any).importMeta !== "undefined";
if (hasImportMeta && ((globalThis as any).importMeta as any).hot) {
  createHMRAccept((globalThis as any).importMeta as any);
  connectHMRClient(24678);
}
