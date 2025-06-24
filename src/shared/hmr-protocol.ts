// shared/hmr-protocol.ts
type HMRMessage =
  | { type: "update"; id: string; timestamp: number }
  | { type: "full-reload"; path?: string }
  | { type: "error"; error: string }
  | { type: "prune"; paths: string[] };

interface HMRHandler {
  (payload: HMRMessage): void;
}

export class HMRChannel {
  private handlers = new Set<HMRHandler>();
  private socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as HMRMessage;
        this.handlers.forEach((handler) => handler(payload));
      } catch (err) {
        console.error("Invalid HMR message:", err);
      }
    };
  }

  send(payload: HMRMessage) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  onUpdate(handler: HMRHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
