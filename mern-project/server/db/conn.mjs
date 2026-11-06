import { MongoClient } from "mongodb";
import config from "../config.mjs";
import logger from "../logger.mjs";

// The starter code awaited client.connect() at import time and then called conn.db()
// even if the connection failed -> TypeError and the whole process crashed whenever
// MongoDB was not reachable at start-up.
//
// Important driver detail (found while deploying to Kubernetes): when the *first*
// client.connect() fails (e.g. the backend starts before MongoDB is ready), the Node.js
// driver closes its internal topology but keeps a reference to it. Every later operation
// on that MongoClient then fails forever, even after MongoDB is up. A failed client must
// therefore be discarded and replaced by a new one.
//
// Strategy:
//  - start the HTTP server immediately, connect in the background with a retry loop;
//  - on every failed attempt, close the client and create a fresh one;
//  - until the first successful connection, DB operations fail fast with a
//    MongoNotConnectedError (-> HTTP 503) and readiness reports "not ready";
//  - after a successful connection the driver's own monitoring handles reconnects
//    (e.g. MongoDB pod restarts), no new client is needed.
const RETRY_MS = parseInt(process.env.MONGO_CONNECT_RETRY_MS || "5000", 10);

let client = null;
let currentDb = null;
let connected = false;
let stopped = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function notConnected() {
  const err = new Error("database not connected yet");
  err.name = "MongoNotConnectedError";
  return err;
}

function createClient() {
  client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: config.mongoServerSelectionTimeoutMs,
    maxPoolSize: config.mongoMaxPoolSize,
    appName: "mern-backend",
  });
  client.on("serverHeartbeatFailed", (e) => {
    logger.warn("mongodb heartbeat failed", { error: e.failure?.message });
  });
  currentDb = client.db(config.dbName);
}

export async function connectWithRetry() {
  let attempt = 0;
  while (!connected && !stopped) {
    attempt += 1;
    createClient();
    try {
      await client.connect();
      await currentDb.command({ ping: 1 });
      connected = true;
      logger.info("connected to mongodb", { attempt });
    } catch (e) {
      logger.error("mongodb connection failed, retrying with a new client", {
        attempt,
        retry_in_ms: RETRY_MS,
        error: e.message,
      });
      await client.close(true).catch(() => {});
      if (!stopped) await sleep(RETRY_MS);
    }
  }
}

// Stable facade handed to the routes: always delegates to the current, healthy client.
export const db = {
  collection(name) {
    if (!connected) throw notConnected();
    return currentDb.collection(name);
  },
};

export async function pingDb() {
  if (!connected) throw notConnected();
  await currentDb.command({ ping: 1 });
}

export async function closeDb() {
  stopped = true;
  if (client) await client.close().catch(() => {});
}

export default db;
