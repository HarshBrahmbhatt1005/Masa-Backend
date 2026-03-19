import cors from "cors";
import express from "express";
import path from "node:path";
import { ZodError } from "zod";
import { createSubmission, getSubmissionById, initDb, listSubmissions, updateSubmission } from "./db";
import { createSubmissionSchema, updateSubmissionSchema } from "./validators";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

(async () => {
  try {
    await initDb();
    console.log("Database initialized");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  }
})();

// CORS configuration - allowed origins from env for security
const allowedOrigins = [
  "http://localhost:5173", // Local frontend
  process.env.FRONTEND_URL?.trim().replace(/\/$/, ""), // Production frontend
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
  credentials: true
}));

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/submissions", async (req, res) => {
  try {
    const parsed = createSubmissionSchema.parse(req.body);
    const created = await createSubmission(parsed);
    res.status(201).json({ data: created });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: "Validation error", errors: error.issues });
      return;
    }

    res.status(500).json({ message: "Failed to create submission" });
  }
});

app.get("/api/submissions", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;

  try {
    const submissions = await listSubmissions(date);
    res.json({ data: submissions });
  } catch {
    res.status(500).json({ message: "Failed to fetch submissions" });
  }
});

app.put("/api/submissions/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "Invalid submission id" });
    return;
  }

  try {
    const parsed = updateSubmissionSchema.parse(req.body);
    const updated = await updateSubmission(id, parsed);

    if (!updated) {
      res.status(404).json({ message: "Submission not found" });
      return;
    }

    res.json({ data: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: "Validation error", errors: error.issues });
      return;
    }

    if (error instanceof Error && (error.message.includes("UNIQUE") || error.message.includes("unique"))) {
      res.status(409).json({ message: "Sr No already exists" });
      return;
    }

    res.status(500).json({ message: "Failed to update submission" });
  }
});

app.get("/api/submissions/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "Invalid submission id" });
    return;
  }

  try {
    const entry = await getSubmissionById(id);
    if (!entry) {
      res.status(404).json({ message: "Submission not found" });
      return;
    }

    res.json({ data: entry });
  } catch {
    res.status(500).json({ message: "Failed to fetch submission" });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
