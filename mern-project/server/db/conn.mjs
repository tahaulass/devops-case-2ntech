import { MongoClient } from "mongodb";
import config from "../config.mjs";
import logger from "../logger.mjs";

// The starter code awaited client.connect() at import time and then called conn.db()
// even if the connection failed -> TypeError and the whole process crashed whenever
// MongoDB was not reachable at start-up.
//
// The driver (>= 4.7) connects lazily on the first operation and reconnects on its own,
// so we create the client without blocking start-up. Readiness is reported separately by
// pinging the server (see routes/healthcheck.mjs); while Mongo is down the pod is simply
// taken out of the Service endpoints instead of crash-looping.
export const client = new MongoClient(config.mongoUri, {
  serverSelectionTimeoutMS: config.mongoServerSelectionTimeoutMs,
  maxPoolSize: config.mongoMaxPoolSize,
  appName: "mern-backend",
});

client.on("serverHeartbeatFailed", (e) => {
  logger.warn("mongodb heartbeat failed", { error: e.failure?.message });
});

export const db = client.db(config.dbName);

export async function pingDb() {
  await db.command({ ping: 1 });
}

export default db;
