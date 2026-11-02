// Centralised, environment-driven configuration.
// Nothing here has a secret default: the Mongo URI must come from the environment
// (Kubernetes Secret, docker-compose env file, or a local, git-ignored .env file).
import dotenv from "dotenv";

// Only load a .env file outside production. In containers, config comes from env vars.
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const required = (name, fallbackName) => {
  const value = process.env[name] || (fallbackName && process.env[fallbackName]);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const config = {
  port: parseInt(process.env.PORT || "5050", 10),
  // ATLAS_URI kept as a fallback for backwards compatibility with the starter project.
  mongoUri: required("MONGODB_URI", "ATLAS_URI"),
  dbName: process.env.DB_NAME || "employees",
  // Comma-separated list of allowed browser origins. Empty = same-origin only (no CORS headers).
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  mongoServerSelectionTimeoutMs: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "5000", 10),
  mongoMaxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || "20", 10),
  shutdownTimeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || "10000", 10),
};

export default config;
