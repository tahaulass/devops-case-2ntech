// Unit/API tests that run without MongoDB (in-memory fake collection).
// Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { createApp } from "../app.mjs";
import { validateRecord } from "../routes/record.mjs";

function fakeDb() {
  const docs = new Map();
  const collection = {
    find: () => ({ limit: () => ({ toArray: async () => [...docs.values()] }) }),
    findOne: async ({ _id }) => docs.get(String(_id)) || null,
    insertOne: async (doc) => {
      const _id = new ObjectId();
      docs.set(String(_id), { _id, ...doc });
      return { acknowledged: true, insertedId: _id };
    },
    updateOne: async ({ _id }, { $set }) => {
      const d = docs.get(String(_id));
      if (!d) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(d, $set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    deleteOne: async ({ _id }) => ({ deletedCount: docs.delete(String(_id)) ? 1 : 0 }),
  };
  return { collection: () => collection };
}

let server;
let base;
let dbUp = true;

before(async () => {
  const app = createApp({
    db: fakeDb(),
    pingDb: async () => {
      if (!dbUp) throw new Error("down");
    },
  });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("validateRecord rejects missing and invalid fields", () => {
  assert.equal(validateRecord({}).errors.length, 3);
  assert.equal(validateRecord({ name: "a", position: "b", level: "CEO" }).errors.length, 1);
  assert.deepEqual(validateRecord({ name: " a ", position: "b", level: "Junior" }), {
    errors: [],
    value: { name: "a", position: "b", level: "Junior" },
  });
});

test("liveness is independent of the database", async () => {
  dbUp = false;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/healthcheck`)).status, 200);
  dbUp = true;
});

test("readiness reflects database availability", async () => {
  dbUp = true;
  assert.equal((await fetch(`${base}/readyz`)).status, 200);
  dbUp = false;
  assert.equal((await fetch(`${base}/readyz`)).status, 503);
  dbUp = true;
});

test("invalid ObjectId returns 400 instead of crashing the process", async () => {
  const res = await fetch(`${base}/api/record/not-an-id`);
  assert.equal(res.status, 400);
  // server still alive
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test("CRUD flow with correct status codes", async () => {
  let res = await fetch(`${base}/api/record`, json("POST", { name: "Ada", position: "Dev", level: "Senior" }));
  assert.equal(res.status, 201);
  const { insertedId } = await res.json();

  res = await fetch(`${base}/api/record/${insertedId}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, "Ada");

  res = await fetch(`${base}/api/record/${insertedId}`, json("PATCH", { name: "Ada L.", position: "Dev", level: "Senior" }));
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/record`);
  assert.equal((await res.json()).length, 1);

  res = await fetch(`${base}/api/record/${insertedId}`, { method: "DELETE" });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/record/${insertedId}`);
  assert.equal(res.status, 404);
});

test("invalid payload returns 400", async () => {
  const res = await fetch(`${base}/api/record`, json("POST", { name: "", level: "x" }));
  assert.equal(res.status, 400);
  const bad = await fetch(`${base}/api/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(bad.status, 400);
});

test("metrics endpoint exposes request counters", async () => {
  const body = await (await fetch(`${base}/metrics`)).text();
  assert.match(body, /http_requests_total/);
});
