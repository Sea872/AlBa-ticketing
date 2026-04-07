import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./app/createApp.js";
import { logInfo, logError } from "./utils/logger.js";

function startServer() {
  const config = loadConfig();
  const app = createApp();
  const server = createServer(app);

  server.listen(config.port, () => {
    logInfo("server listening", {
      port: config.port,
      nodeEnv: config.nodeEnv,
    });
  });

  server.on("error", (err) => {
    logError("server error", { message: err.message });
    process.exit(1);
  });
}

startServer();
