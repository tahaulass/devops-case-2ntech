import express from "express";
import cors from "cors";
import client from "prom-client";
import recordRouter from "./routes/record.mjs";
import healthRouter from "./routes/healthcheck.mjs";
import logger from "./logger.mjs";

// App factory: no network side effects, so it can be unit-tested with a fake db.
export function createApp({ db, pingDb, isShuttingDown = () => false, corsOrigins = [] }) {
  const app = express();
  app.disable("x-powered-by");

  // ---- metrics (Prometheus format on /metrics, not exposed through the Ingress) ----
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });
  const httpRequests = new client.Counter({
    name: "http_requests_total",
    help: "HTTP requests by method, route and status",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });
  const httpDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency",
    labelNames: ["method", "route", "status"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  // ---- access log + metrics ----
  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on("finish", () => {
      // Use the matched route pattern (e.g. /api/record/:id) to keep label cardinality bounded.
      const route = req.route ? req.baseUrl + req.route.path : "unmatched";
      const labels = { method: req.method, route, status: String(res.statusCode) };
      end(labels);
      httpRequests.inc(labels);
      // Probes and scrapes are noisy; only log them when they fail.
      const isProbe = ["/healthz", "/readyz", "/metrics"].includes(req.path);
      if (!isProbe || res.statusCode >= 400) {
        logger.info("http request", {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
        });
      }
    });
    next();
  });

  // CORS: the frontend is served from the same origin (via nginx / Ingress), so by default
  // no cross-origin access is granted. The starter project allowed every origin.
  if (corsOrigins.length > 0) {
    app.use(cors({ origin: corsOrigins }));
  }
  app.use(express.json({ limit: "10kb" }));

  const health = healthRouter({ pingDb, isShuttingDown });
  app.use("/api/healthcheck", health);
  app.get("/healthz", (req, res) => res.status(200).send("ok"));
  app.get("/readyz", (req, res, next) => {
    req.url = "/ready";
    health(req, res, next);
  });
  app.get("/metrics", async (req, res) => {
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  app.use("/api/record", recordRouter(db));
  // Backwards-compatible paths of the starter API.
  app.use("/record", recordRouter(db));
  app.use("/healthcheck", health);

  app.use((req, res) => res.status(404).json({ error: "not found" }));

  // Central error handler: never leak stack traces, return 503 if the DB is unreachable.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid JSON body" });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "payload too large" });
    }
    const dbDown = /MongoServerSelectionError|MongoNetworkError|MongoNotConnectedError/.test(err.name);
    logger.error("request failed", { path: req.originalUrl, error: err.message, name: err.name });
    if (dbDown) {
      return res.status(503).json({ error: "database unavailable, please retry" });
    }
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
