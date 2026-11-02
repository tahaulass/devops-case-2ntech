import express from "express";
import { ObjectId } from "mongodb";

const LEVELS = ["Intern", "Junior", "Senior"];
const MAX_LEN = 100;

// Express 4 does not catch rejected promises from async handlers. In the starter code an
// invalid id (e.g. GET /record/abc) made `new ObjectId()` throw inside an async handler,
// producing an unhandled rejection that terminates Node -> one request could take the API down.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const parseId = (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: "invalid id" });
    return null;
  }
  return new ObjectId(req.params.id);
};

// Accept only the three known fields, as trimmed strings of bounded length.
// Prevents arbitrary documents / operator injection being written to the collection.
export function validateRecord(body) {
  const errors = [];
  const out = {};
  for (const field of ["name", "position"]) {
    const v = body?.[field];
    if (typeof v !== "string" || v.trim().length === 0) {
      errors.push(`${field} is required`);
    } else if (v.length > MAX_LEN) {
      errors.push(`${field} must be at most ${MAX_LEN} characters`);
    } else {
      out[field] = v.trim();
    }
  }
  if (!LEVELS.includes(body?.level)) {
    errors.push(`level must be one of ${LEVELS.join(", ")}`);
  } else {
    out.level = body.level;
  }
  return { errors, value: out };
}

export default function recordRouter(db) {
  const router = express.Router();
  const records = () => db.collection("records");

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const results = await records().find({}).limit(1000).toArray();
      res.status(200).json(results);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (!id) return;
      const result = await records().findOne({ _id: id });
      if (!result) return res.status(404).json({ error: "not found" });
      res.status(200).json(result);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { errors, value } = validateRecord(req.body);
      if (errors.length) return res.status(400).json({ errors });
      const result = await records().insertOne({ ...value, createdAt: new Date() });
      res.status(201).json(result);
    })
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (!id) return;
      const { errors, value } = validateRecord(req.body);
      if (errors.length) return res.status(400).json({ errors });
      const result = await records().updateOne({ _id: id }, { $set: { ...value, updatedAt: new Date() } });
      if (result.matchedCount === 0) return res.status(404).json({ error: "not found" });
      res.status(200).json(result);
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (!id) return;
      const result = await records().deleteOne({ _id: id });
      if (result.deletedCount === 0) return res.status(404).json({ error: "not found" });
      res.status(200).json(result);
    })
  );

  return router;
}
