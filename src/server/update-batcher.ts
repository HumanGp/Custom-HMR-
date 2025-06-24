// update-batcher.ts
import { PriorityQueue } from "typescript-collections";

type UpdatePriority = "high" | "normal" | "low";

interface UpdateJob {
  file: string;
  priority: UpdatePriority;
  timestamp: number;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class UpdateBatcher {
  private queue: PriorityQueue<UpdateJob> = new PriorityQueue<UpdateJob>(
    (a: UpdateJob, b: UpdateJob): number => {
      // Higher priority first, then older timestamps first
      if (a.priority !== b.priority) {
        return a.priority === "high"
          ? -1
          : a.priority === "normal" && b.priority === "low"
          ? -1
          : 1;
      }
      return a.timestamp - b.timestamp;
    }
  );

  private isProcessing = false;
  private pendingPromises = new Map<string, Promise<void>>();

  constructor(
    private handler: (file: string) => Promise<void>,
    private options: {
      concurrency?: number;
      batchWindow?: number;
    } = {}
  ) {
    this.options.concurrency = this.options.concurrency || 4;
    this.options.batchWindow = this.options.batchWindow || 100;
  }

  async enqueue(
    file: string,
    priority: UpdatePriority = "normal"
  ): Promise<void> {
    // Deduplicate pending updates
    if (this.pendingPromises.has(file)) {
      return this.pendingPromises.get(file)!;
    }

    let resolve!: () => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.pendingPromises.set(file, promise);

    this.queue.add({
      file,
      priority,
      timestamp: Date.now(),
      resolve,
      reject,
    });

    if (!this.isProcessing) {
      this.processQueue();
    }

    return promise;
  }

  private async processQueue() {
    this.isProcessing = true;
    const workers: Promise<void>[] = [];

    for (let i = 0; i < this.options.concurrency!; i++) {
      workers.push(this.worker());
    }

    await Promise.all(workers);
    this.isProcessing = false;
  }

  private async worker() {
    while (!this.queue.isEmpty()) {
      const batch = this.collectBatch();
      if (batch.length === 0) continue;

      try {
        await this.processBatch(batch);
      } catch (err) {
        console.error("Error processing batch:", err);
        batch.forEach((job) => job.reject(err as Error));
      }
    }
  }

  private collectBatch(): UpdateJob[] {
    const batch: UpdateJob[] = [];
    const now = Date.now();
    const batchWindow = this.options.batchWindow!;

    while (!this.queue.isEmpty() && batch.length < 10) {
      // Max batch size
      const job = this.queue.peek()!;

      if (
        batch.length === 0 ||
        (now - job.timestamp < batchWindow &&
          batch[0].priority === job.priority)
      ) {
        batch.push(this.queue.dequeue()!);
      } else {
        break;
      }
    }

    return batch;
  }

  private async processBatch(batch: UpdateJob[]) {
    const files = batch.map((job) => job.file);
    console.log(`Processing batch of ${files.length} files:`, files);

    try {
      // Process files in parallel but maintain order for notifications
      await Promise.all(batch.map((job) => this.handler(job.file)));

      // Resolve all promises
      batch.forEach((job) => {
        job.resolve();
        this.pendingPromises.delete(job.file);
      });
    } catch (err) {
      // Clean up failed jobs
      batch.forEach((job) => {
        this.pendingPromises.delete(job.file);
      });
      throw err;
    }
  }
}
