import config from "./config.mjs";
import logger from "./logger.mjs";
import { client, db, pingDb } from "./db/conn.mjs";
import { createApp } from "./app.mjs";

let shuttingDown = false;

const app = createApp({
  db,
  pingDb,
  isShuttingDown: () => shuttingDown,
  corsOrigins: config.corsOrigins,
});

const server = app.listen(config.port, () => {
  logger.info("server listening", { port: config.port, db: config.dbName });
});

// Try an initial connection only to log the result; failure is NOT fatal.
// The process keeps serving /healthz, reports not-ready on /readyz and recovers by itself
// once MongoDB becomes reachable.
client
  .connect()
  .then(() => logger.info("connected to mongodb"))
  .catch((e) => logger.error("initial mongodb connection failed, will retry lazily", { error: e.message }));

// Graceful shutdown: Kubernetes sends SIGTERM on rollout/scale-down. Stop reporting ready,
// finish in-flight requests, close the Mongo pool, then exit.
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown started", { signal });
  const force = setTimeout(() => {
    logger.error("forced shutdown after timeout");
    process.exit(1);
  }, config.shutdownTimeoutMs);
  force.unref();
  server.close(async () => {
    await client.close().catch(() => {});
    logger.info("shutdown complete");
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", { error: String(reason) });
});
