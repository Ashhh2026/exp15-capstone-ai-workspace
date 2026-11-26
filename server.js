const path = require("path");
const express = require("express");
const cors = require("cors");
const { connectDatabase, getDbMode } = require("./lib/db");
const {
  listDeliverables,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  generateExecutiveBrief,
  seedCapstoneData,
} = require("./lib/workspaceStore");

const app = express();
const PORT = process.env.PORT || 4015;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    experiment: 15,
    capstone: true,
    student: "Ashwarya Agrawal (23BCON1659)",
    db: getDbMode(),
  });
});

app.get(
  "/api/deliverables",
  asyncHandler(async (req, res) => {
    const items = await listDeliverables(req.query);
    res.json({ total: items.length, items });
  })
);

app.post(
  "/api/deliverables",
  asyncHandler(async (req, res) => {
    const created = await createDeliverable(req.body || {});
    res.status(201).json({ data: created });
  })
);

app.patch(
  "/api/deliverables/:id",
  asyncHandler(async (req, res) => {
    const updated = await updateDeliverable(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Not Found", message: "Deliverable not found." });
    res.json({ data: updated });
  })
);

app.delete(
  "/api/deliverables/:id",
  asyncHandler(async (req, res) => {
    const removed = await deleteDeliverable(req.params.id);
    if (!removed) return res.status(404).json({ error: "Not Found", message: "Deliverable not found." });
    res.status(204).send();
  })
);

app.post(
  "/api/ai/brief",
  asyncHandler(async (req, res) => {
    const focus = typeof req.body?.focus === "string" ? req.body.focus.trim() : "overview";
    const result = await generateExecutiveBrief(focus);
    res.json(result);
  })
);

app.use((err, req, res, next) => {
  if (err && err.statusCode && err.details) {
    return res.status(err.statusCode).json({
      error: err.message || "Validation Error",
      details: err.details,
    });
  }
  return res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  const mode = await connectDatabase();
  await seedCapstoneData();
  app.listen(PORT, () => {
    console.log(`Exp 15 Capstone AI Workspace running at http://localhost:${PORT} (db=${mode})`);
  });
}

start();
