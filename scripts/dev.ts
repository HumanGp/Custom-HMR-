import { HMRServer } from "../server/hmr-server";

const server = new HMRServer({
  port: 24678,
  root: process.cwd(),
});

// Optional: Add express/serve-static if you need to serve files
