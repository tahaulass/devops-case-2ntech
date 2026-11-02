// Runs once, on first start with an empty data directory (docker-entrypoint-initdb.d).
// Creates a least-privilege application user: readWrite on the application database only.
// The root user is used exclusively by the backup/restore jobs.
const dbName = process.env.APP_DB_NAME || "employees";
db.getSiblingDB(dbName).createUser({
  user: process.env.MONGO_APP_USERNAME,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: "readWrite", db: dbName }],
});
print(`created application user for database ${dbName}`);
