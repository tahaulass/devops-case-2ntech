import express from "express";

// Two different questions, two different endpoints:
//  - liveness  (/healthz, /api/healthcheck): is the Node process able to serve HTTP?
//    Must NOT depend on MongoDB, otherwise a DB outage would make Kubernetes restart
//    every backend pod in a loop and turn a DB problem into a full outage.
//  - readiness (/readyz, /api/healthcheck/ready): can this pod do useful work right now?
//    Pings MongoDB; a failing check removes the pod from the Service endpoints only.
export default function healthRouter({ pingDb, isShuttingDown }) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.status(200).json({
      uptime: process.uptime(),
      message: "OK",
      timestamp: Date.now(),
    });
  });

  router.get("/ready", async (req, res) => {
    if (isShuttingDown()) {
      return res.status(503).json({ status: "shutting_down" });
    }
    try {
      await pingDb();
      res.status(200).json({ status: "ready", database: "up" });
    } catch (e) {
      res.status(503).json({ status: "not_ready", database: "down" });
    }
  });

  return router;
}
