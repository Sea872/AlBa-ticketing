import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./app/createApp.js";
import { logInfo, logError, logWarn } from "./utils/logger.js";

function startServer() {
  const config = loadConfig();

  if (config.isProduction && !process.env.JWT_SECRET) {
    logError("JWT_SECRET is required in production");
    process.exit(1);
  }

  if (!config.isProduction && !process.env.JWT_SECRET) {
    logWarn("JWT_SECRET not set; using development default (set JWT_SECRET for realistic auth tests)");
  }

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
