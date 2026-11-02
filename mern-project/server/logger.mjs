// Minimal structured (JSON-lines) logger. One line per event on stdout/stderr so that
// `kubectl logs`, Docker and any log collector (Loki, Fluent Bit, CloudWatch) can parse it
// without extra dependencies.
const write = (level, msg, fields = {}) => {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: "backend",
    msg,
    ...fields,
  });
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
};

const logger = {
  info: (msg, fields) => write("info", msg, fields),
  warn: (msg, fields) => write("warn", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
};

export default logger;
