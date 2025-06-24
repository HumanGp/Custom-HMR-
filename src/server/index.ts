// server/index.ts
import * as fs from "fs";
import { HMRServer } from "./hmr-server.ts";
import { ModuleGraph } from "./module-graph.ts";
import { TransformPipeline } from "./transform-pipeline.ts";
import { UpdateBatcher } from "./update-batcher.ts";

export function createHMRServer(options: { port: number; root: string }) {
  const moduleGraph = new ModuleGraph();
  const transformPipeline = new TransformPipeline();
  const batcher = new UpdateBatcher(async (file) => {
    const code = await fs.promises.readFile(file, "utf-8");
    const { code: transformed, deps } = await transformPipeline.transform(
      file,
      code,
      true
    );

    moduleGraph.updateModule(file, transformed);
    const updateChain = moduleGraph.getUpdateChain(file);

    // Notify clients about the update chain
    hmrServer.notifyUpdate(updateChain);
  });

  const hmrServer = new HMRServer({
    ...options,
    onFileChange: (file) => batcher.enqueue(file),
  });

  return hmrServer;
}
